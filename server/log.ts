// Logging: every entry goes to the console (journald on the VPS); entries at LOG_LEVEL and above also go to the
// Telegram group LOG_GROUP_ID. Telegram entries are batched into one message every few seconds, so a burst stays
// within Telegram's rate limits (about 20 messages a minute per group). Warnings and errors notify; the rest is silent.
import { env, type LogLevel } from './env.ts';

const ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const ICON: Record<LogLevel, string> = { debug: '🔹', info: 'ℹ️', warn: '⚠️', error: '🛑' };

/** Whether an entry at `level` reaches a destination set to `threshold` ('off' takes nothing). */
export const passes = (level: LogLevel, threshold: LogLevel | 'off') => threshold !== 'off' && ORDER.indexOf(level) >= ORDER.indexOf(threshold);

/** Escapes user-provided text for Telegram HTML. */
export const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A Telegram user as a mention: name, @username and id. */
export const who = (u: { id: number; first_name?: string; last_name?: string; username?: string }) => {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || String(u.id);
  return `<a href="tg://user?id=${u.id}">${esc(name)}</a>${u.username ? ` @${esc(u.username)}` : ''} <code>${u.id}</code>`;
};

/**
 * `html`: one line of Telegram HTML; escape any user text with esc(). The console gets it without tags.
 * `detail`: extra text such as a stack trace, shown preformatted.
 */
function write(level: LogLevel, html: string, detail?: string) {
  if (passes(level, env.logLevel === 'debug' ? 'debug' : 'info')) {
    const text = `[${level}] ${plain(html)}${detail ? `\n${detail}` : ''}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(text);
  }
  if (env.logGroupId && env.botToken && passes(level, env.logLevel)) enqueue(level, line(level, html, detail));
}

export const log = {
  debug: (html: string, detail?: string) => write('debug', html, detail),
  info: (html: string, detail?: string) => write('info', html, detail),
  warn: (html: string, detail?: string) => write('warn', html, detail),
  error: (html: string, detail?: string) => write('error', html, detail),
};

/** An error's stack (or message), for `detail`. */
export const stack = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : String(e));

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

const time = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tashkent' });

/** Exported for tests. */
export function line(level: LogLevel, html: string, detail?: string) {
  const text = `${ICON[level]} <code>${time()}</code> ${html}`;
  return detail ? `${text}\n<pre>${esc(detail.slice(0, 1500))}</pre>` : text;
}

// ---------- batching to Telegram ----------

const FLUSH_MS = 3000;
const MAX_TEXT = 4000; // Telegram allows 4096 characters per message
const MAX_QUEUE = 300; // past this, entries are dropped and counted, e.g. while Telegram is unreachable

let queue: { level: LogLevel; text: string }[] = [];
let dropped = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function enqueue(level: LogLevel, text: string) {
  if (queue.length >= MAX_QUEUE) dropped++;
  else queue.push({ level, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 20)}…` : text });
  timer ??= setTimeout(flush, FLUSH_MS);
}

/** Groups entries into messages of at most `max` characters, in order. Exported for tests. */
export function pack(texts: string[], max = MAX_TEXT): string[] {
  const out: string[] = [];
  for (const t of texts) {
    const last = out.length - 1;
    if (last >= 0 && out[last].length + 1 + t.length <= max) out[last] += `\n${t}`;
    else out.push(t);
  }
  return out;
}

/** Sends what is queued now, e.g. before the process exits. */
export async function flushLogs() {
  if (timer) clearTimeout(timer);
  await flush();
}

async function flush() {
  timer = null;
  const entries = queue;
  queue = [];
  if (dropped) entries.push({ level: 'warn', text: `⚠️ ${dropped} log entries dropped` });
  dropped = 0;
  const loud = entries.some((e) => passes(e.level, 'warn'));
  for (const text of pack(entries.map((e) => e.text))) {
    try {
      // Plain fetch, not botApi: a failure here is reported to the console only, never logged again.
      const res = await fetch(`https://api.telegram.org/bot${env.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.logGroupId, text, parse_mode: 'HTML', disable_notification: !loud, link_preview_options: { is_disabled: true } }),
      });
      if (!res.ok) console.error(`[log] Telegram refused a log message: ${res.status} ${await res.text()}`);
    } catch (e) {
      console.error(`[log] could not send logs to Telegram: ${e}`);
    }
  }
}
