// Outgoing Telegram Bot API calls. Incoming commands (e.g. /here) are handled in bot.ts.
import { fulfillmentText, pickupBranch, SHOP_PHONE, yandexMapUrl } from '../shared/delivery.ts';
import type { LatLng, Order } from '../shared/types.ts';
import { lineTotal, qtyText } from '../shared/units.ts';
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
  console.log(`[telegram] order #${order.id} posted to the group`);
}

/**
 * The customer sent the delivery location: the group message gets the map link, followed by a native location
 * message as a reply to the order, so the map shows right in the group.
 */
export async function announceLocation(order: Order): Promise<void> {
  if (!enabled() || !order.location) return;
  await refreshOrderMessage(order);
  const messageId = getOrderMessageId(order.id);
  await botApi('sendLocation', {
    chat_id: env.groupId,
    latitude: order.location.lat,
    longitude: order.location.lng,
    ...(messageId && { reply_parameters: { message_id: messageId, allow_sending_without_reply: true } }),
  });
}

/**
 * Sends the customer an order confirmation in their private chat with the bot. Telegram only allows this if they
 * started the bot or allowed messages (the app asks at checkout), so a refusal is expected and only logged.
 */
export async function notifyCustomer(order: Order): Promise<void> {
  if (!env.botToken) return;
  try {
    await botApi('sendMessage', { chat_id: order.userId, ...customerMessage(order) });
    if (awaitsLocation(order)) await botApi('sendMessage', { chat_id: order.userId, ...locationRequest() });
    console.log(`[telegram] order #${order.id} confirmation sent to the customer`);
  } catch (e) {
    if (!(e instanceof TelegramError)) throw e;
    console.log(`[telegram] could not message the customer of order #${order.id}: ${e.message}`);
  }
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

/** Exported for tests. */
export function orderMessage(order: Order) {
  const status = (order.paidAt ? "✅ To'langan" : "🟡 To'lanmagan") + (order.completedAt ? ' · 📦 Bajarildi' : '');
  const lines = [
    `<b>Buyurtma #${order.id}</b> · ${money(order.total)}`,
    status,
    '',
    ...itemLines(order),
    '',
    ...(order.fulfillment ? [fulfillmentText(order.fulfillment)] : []),
    ...(order.location ? [`📍 ${mapLink(order.location, 'Yandex xarita')}`] : awaitsLocation(order) ? ['📍 Manzil kutilmoqda'] : []),
    `<a href="tg://user?id=${order.userId}">${esc(order.name)}</a>`,
    esc(order.phone),
  ];
  return htmlWithOpenButton(lines, order.id);
}

/** The confirmation the customer gets in their private chat. Wording from the shop. Exported for tests. */
export function customerMessage(order: Order) {
  const branch = order.fulfillment && pickupBranch(order.fulfillment);
  const products = order.items.map((i) => `${esc(i.name)} (${qtyText(i.qty, i.unit)})`);
  const lines = [
    '✅ Buyurtmangiz muvaffaqiyatli qabul qilindi!',
    '',
    `Buyurtma raqami: #${order.id}`,
    ...(products.length === 1 ? [`Mahsulot: ${products[0]}`] : ['Mahsulotlar:', ...products.map((p) => `• ${p}`)]),
    `Jami summa: ${money(order.total)}`,
    '',
    ...(order.fulfillment ? [fulfillmentText(order.fulfillment)] : []),
    ...(branch ? [`📍 Olib ketish manzili: ${mapLink(branch.location, `${branch.name} filiali`)}`] : []),
    ...(order.location ? [`📍 Shu manzilga yetkazib beriladi: ${mapLink(order.location, "Xaritada ko'rish")}`] : []),
    '',
    branch
      ? "🕐 Operatorimiz tez orada (5-10 daqiqa ichida) siz bilan bog'lanib, olib ketish vaqtini va to'lov usulini tasdiqlaydi."
      : order.fulfillment === 'other'
        ? "🚚 Operatorimiz tez orada (5-10 daqiqa ichida) siz bilan bog'lanib, yetkazib berish shartlari va to'lov usulini kelishib oladi."
        : "🚚 Operatorimiz tez orada (5-10 daqiqa ichida) siz bilan bog'lanib, yetkazib berish vaqtini va to'lov usulini tasdiqlaydi.",
    '',
    `📞 Savollaringiz bo'lsa: ${SHOP_PHONE}`,
    'Xaridingiz uchun rahmat! 🤝',
  ];
  return htmlWithOpenButton(lines, order.id);
}

/** A delivery whose customer hasn't sent the location yet. Orders from before fulfillment existed don't count. */
const awaitsLocation = (o: Order) => !!o.fulfillment && !pickupBranch(o.fulfillment) && !o.location;

/**
 * Sent after the confirmation of a delivery order. Messages with a keyboard button can't also have the inline
 * Ochish button, hence a second message. The button shares the current position; 📎 → Location picks another point.
 */
export function locationRequest() {
  return {
    text: "📍 Yetkazib berish manzilini yuboring.\nBoshqa joyga kerak bo'lsa: 📎 → Joylashuv.",
    reply_markup: { keyboard: [[{ text: '📍 Joylashuvni yuborish', request_location: true }]], resize_keyboard: true, is_persistent: true },
  };
}

/** Reply to a location sent in the bot chat: which order it was saved to, or that there is none. Removes the button. */
export function locationReply(order: Order | null) {
  return {
    text: order
      ? `📍 Buyurtma #${order.id} shu manzilga yetkazib beriladi: ${mapLink(order.location!, "Xaritada ko'rish")}`
      : "Yetkazib berishni kutayotgan buyurtmangiz yo'q.",
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { remove_keyboard: true },
  };
}

const mapLink = (p: LatLng, text: string) => `<a href="${esc(yandexMapUrl(p))}">${esc(text)}</a>`;

const itemLines = (order: Order) =>
  order.items.map((i) => `${esc(i.name)}: ${qtyText(i.qty, i.unit)} × ${num(i.price)} = ${money(lineTotal(i.price, i.qty))}`);

function htmlWithOpenButton(lines: string[], orderId: number) {
  return {
    text: lines.join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    // web_app buttons are not allowed in groups, so this is a t.me link with a start parameter (it works in
    // private chats too). The web app reads it from initDataUnsafe.start_param and opens /orders/:id.
    reply_markup: env.appLink
      ? { inline_keyboard: [[{ text: 'Ochish', url: `${env.appLink}?startapp=order_${orderId}` }]] }
      : undefined,
  };
}

const num = (n: number) => n.toLocaleString('en-US').replaceAll(',', ' ');
const money = (n: number) => `${num(n)} so'm`;
const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
