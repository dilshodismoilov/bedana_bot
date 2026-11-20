// Incoming bot commands and delivery locations, received by long polling (works the same locally and on the VPS; no webhook to set up).
// Only one process may poll a bot at a time: running local dev and the VPS with the same token makes them fight.
import { env } from './env.ts';
import { esc, log, stack, who } from './log.ts';
import { setUserLocation } from './store.ts';
import { botApi, locationReply, TelegramError } from './telegram.ts';

type Message = {
  message_id: number;
  text?: string;
  location?: { latitude: number; longitude: number }; // also set on venues and live locations
  chat: { id: number; type: string; title?: string };
  from?: { id: number; first_name?: string };
};
type Update = { update_id: number; message?: Message };

/** True if `text` is `/name` or `/name@<this bot>`, optionally followed by arguments. */
export function isCommand(text: string | undefined, name: string, botUsername: string): boolean {
  const m = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(text ?? '');
  return !!m && m[1].toLowerCase() === name && (!m[2] || m[2].toLowerCase() === botUsername.toLowerCase());
}

/** Reply to /here: the chat id, ready to paste into .env (GROUP_ID for orders, or LOG_GROUP_ID for logs). */
export function hereReply(chatId: number): string {
  if (String(chatId) === env.logGroupId) return `<code>LOG_GROUP_ID=${chatId}</code>\n✅ Loglar shu guruhga keladi`;
  const connected = String(chatId) === env.groupId ? "\n✅ Buyurtmalar shu guruhga keladi" : '';
  return `<code>GROUP_ID=${chatId}</code>${connected}`;
}

/**
 * Reply to /start in a private chat: a short greeting and a button that opens the shop.
 * Plain text (no parse_mode), so the user's name needs no escaping.
 */
export function startReply(firstName: string | undefined) {
  return {
    text: `Assalomu alaykum${firstName ? `, ${firstName}` : ''}! 👋\nDo'konimizga xush kelibsiz. Mahsulotlarni ko'rib, buyurtma berish uchun quyidagi tugmani bosing.`,
    // A t.me link opens the bot's Mini App (set in BotFather), like the Ochish button on orders.
    reply_markup: env.appLink ? { inline_keyboard: [[{ text: "🛒 Do'konni ochish", url: `${env.appLink}?startapp` }]] } : undefined,
  };
}

/**
 * A location sent in the private chat is where the customer's next delivery order goes (checkout asks for it,
 * see locationRequest). Sending again replaces it. ~10 cm precision is plenty.
 */
async function receiveLocation(message: Message) {
  const { latitude, longitude } = message.location!;
  const point = { lat: +latitude.toFixed(6), lng: +longitude.toFixed(6) };
  setUserLocation(message.from!.id, point);
  await botApi('sendMessage', { chat_id: message.chat.id, ...locationReply(point) });
  log.info(`📍 ${who(message.from!)} sent a delivery location`);
}

async function handle(message: Message, botUsername: string) {
  if (message.chat.type === 'private' && message.location && message.from) {
    await receiveLocation(message);
    return;
  }
  if (message.chat.type === 'private' && isCommand(message.text, 'start', botUsername)) {
    await botApi('sendMessage', { chat_id: message.chat.id, ...startReply(message.from?.first_name) });
    if (message.from) log.info(`👋 ${who(message.from)} pressed /start`);
    return;
  }
  const inGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (inGroup && isCommand(message.text, 'here', botUsername)) {
    await botApi('sendMessage', {
      chat_id: message.chat.id,
      text: hereReply(message.chat.id),
      parse_mode: 'HTML',
      reply_parameters: { message_id: message.message_id },
    });
    log.info(`/here answered in "${esc(message.chat.title ?? '')}" <code>${message.chat.id}</code>`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs forever: receives updates and dispatches commands. Errors are logged and retried. */
export async function pollCommands(): Promise<never> {
  const me = await retry(() => botApi<{ username: string }>('getMe', {}));
  log.info(`🚀 Started: @${me.username} is listening`);
  let offset = 0;
  let failing = false; // log the first failure of a streak and the recovery, not every retry
  for (;;) {
    try {
      const updates = await botApi<Update[]>('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      if (failing) log.info('Bot polling works again');
      failing = false;
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await handle(u.message, me.username).catch((e) => log.error('A bot message could not be handled', stack(e)));
      }
    } catch (e) {
      const conflict = e instanceof TelegramError && /Conflict/.test(e.message);
      const message = conflict ? 'Another process is polling this bot (or a webhook is set); retrying every 30s' : `Bot polling failed, retrying every 5s: ${esc(String(e))}`;
      if (!failing) log.error(message);
      else console.error(`[bot] ${message}`);
      failing = true;
      await sleep(conflict ? 30_000 : 5_000);
    }
  }
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      console.error(`[bot] ${e}; retrying in 5s`); // the log group needs the bot too, so console only
      await sleep(5_000);
    }
  }
}

export const botEnabled = () => Boolean(env.botToken);
