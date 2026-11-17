// Incoming bot commands, received by long polling (works the same locally and on the VPS; no webhook to set up).
// Only one process may poll a bot at a time: running local dev and the VPS with the same token makes them fight.
import { env } from './env.ts';
import { botApi, TelegramError } from './telegram.ts';

type Message = { message_id: number; text?: string; chat: { id: number; type: string; title?: string } };
type Update = { update_id: number; message?: Message };

/** True if `text` is `/name` or `/name@<this bot>`, optionally followed by arguments. */
export function isCommand(text: string | undefined, name: string, botUsername: string): boolean {
  const m = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(text ?? '');
  return !!m && m[1].toLowerCase() === name && (!m[2] || m[2].toLowerCase() === botUsername.toLowerCase());
}

/** Reply to /here: the chat id, ready to paste into .env. */
export function hereReply(chatId: number): string {
  const connected = String(chatId) === env.groupId ? "\n✅ Buyurtmalar shu guruhga keladi" : '';
  return `<code>GROUP_ID=${chatId}</code>${connected}`;
}

async function handle(message: Message, botUsername: string) {
  const inGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (inGroup && isCommand(message.text, 'here', botUsername)) {
    await botApi('sendMessage', {
      chat_id: message.chat.id,
      text: hereReply(message.chat.id),
      parse_mode: 'HTML',
      reply_parameters: { message_id: message.message_id },
    });
    console.log(`[bot] /here answered in "${message.chat.title}" (${message.chat.id})`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs forever: receives updates and dispatches commands. Errors are logged and retried. */
export async function pollCommands(): Promise<never> {
  const me = await retry(() => botApi<{ username: string }>('getMe', {}));
  console.log(`[bot] @${me.username} listening for commands`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await botApi<Update[]>('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await handle(u.message, me.username).catch((e) => console.error('[bot] command failed', e));
      }
    } catch (e) {
      const conflict = e instanceof TelegramError && /Conflict/.test(e.message);
      console.error(conflict ? '[bot] another process is polling this bot (or a webhook is set); retrying in 30s' : `[bot] polling failed: ${e}`);
      await sleep(conflict ? 30_000 : 5_000);
    }
  }
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      console.error(`[bot] ${e}; retrying in 5s`);
      await sleep(5_000);
    }
  }
}

export const botEnabled = () => Boolean(env.botToken);
