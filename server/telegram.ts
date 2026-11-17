// Outgoing Telegram Bot API calls. Incoming commands (e.g. /here) are handled in bot.ts.
import type { Order } from '../shared/types.ts';
import { env } from './env.ts';
import { getOrderMessageId, setOrderMessageId } from './store.ts';

/** Telegram rejected the call (as opposed to a network failure). */
export class TelegramError extends Error {}

export async function botApi<T = any>(method: string, body: object): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new TelegramError(`Telegram ${method}: ${json.description}`);
  return json.result;
}

const enabled = () => Boolean(env.botToken && env.groupId);

/** Posts a new order to the orders group and remembers the message id. */
export async function announceOrder(order: Order): Promise<void> {
  if (!enabled()) return console.log(`[telegram] disabled, skipped announcing order #${order.id}`);
  const msg = await botApi<{ message_id: number }>('sendMessage', { chat_id: env.groupId, ...orderMessage(order) });
  setOrderMessageId(order.id, msg.message_id);
  // A native location message, as a reply to the order: tapping it opens the courier's maps app.
  if (order.location) {
    await botApi('sendLocation', {
      chat_id: env.groupId,
      latitude: order.location.lat,
      longitude: order.location.lng,
      reply_parameters: { message_id: msg.message_id },
    });
  }
  console.log(`[telegram] order #${order.id} posted to the group`);
}

/** Re-renders the group message after the order changed (marked paid or completed). */
export async function refreshOrderMessage(order: Order): Promise<void> {
  const messageId = getOrderMessageId(order.id);
  if (!enabled() || !messageId) return;
  try {
    await botApi('editMessageText', { chat_id: env.groupId, message_id: messageId, ...orderMessage(order) });
  } catch (e) {
    if (!String(e).includes('message is not modified')) throw e;
  }
}

function orderMessage(order: Order) {
  const status = (order.paidAt ? "✅ To'langan" : "🟡 To'lanmagan") + (order.completedAt ? ' · 📦 Bajarildi' : '');
  const lines = [
    `<b>Buyurtma #${order.id}</b> · ${money(order.total)}`,
    status,
    '',
    ...order.items.map((i) => `${esc(i.name)}: ${i.qty} dona × ${num(i.price)} = ${money(i.price * i.qty)}`),
    '',
    `<a href="tg://user?id=${order.userId}">${esc(order.name)}</a>`,
    esc(order.phone),
  ];
  return {
    text: lines.join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    // web_app buttons are not allowed in groups, so this is a t.me link with a start parameter.
    // The web app reads it from initDataUnsafe.start_param and opens /orders/:id.
    reply_markup: env.appLink
      ? { inline_keyboard: [[{ text: 'Ochish', url: `${env.appLink}?startapp=order_${order.id}` }]] }
      : undefined,
  };
}

const num = (n: number) => n.toLocaleString('en-US').replaceAll(',', ' ');
const money = (n: number) => `${num(n)} so'm`;
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
