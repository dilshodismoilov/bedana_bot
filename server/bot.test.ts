// Command parsing for incoming bot messages. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEV = '1';
process.env.GROUP_ID = '-1001234567890';
process.env.APP_LINK = 'https://t.me/shop_bot';
const { isCommand, hereReply, startReply } = await import('./bot.ts');

test('startReply greets by first name and links to the shop', () => {
  const r = startReply('Ali');
  assert.match(r.text, /^Assalomu alaykum, Ali! 👋\n/);
  assert.match(startReply(undefined).text, /^Assalomu alaykum! 👋/);
  assert.equal(r.reply_markup?.inline_keyboard[0][0].url, 'https://t.me/shop_bot?startapp');
  assert.ok(isCommand('/start', 'start', 'shop_bot') && isCommand('/start order_5', 'start', 'shop_bot'), 'deep-link payloads still greet');
});

test('isCommand matches the command only for this bot', () => {
  const yes = ['/here', '/here@shop_bot', '/HERE', '/here@Shop_Bot', '/here please'];
  const no = ['/here@other_bot', '/hereabouts', 'here', ' /here', '/start', 'say /here', undefined];
  for (const t of yes) assert.equal(isCommand(t, 'here', 'shop_bot'), true, String(t));
  for (const t of no) assert.equal(isCommand(t, 'here', 'shop_bot'), false, String(t));
});

test('hereReply gives a copyable GROUP_ID line and marks the configured group', () => {
  assert.equal(hereReply(-1009999999999), '<code>GROUP_ID=-1009999999999</code>');
  assert.match(hereReply(-1001234567890), /^<code>GROUP_ID=-1001234567890<\/code>\n✅/);
});

test('after a location is sent, the reply links back to the cart; the request opens the bot chat', async () => {
  const { botChatLink, locationReply } = await import('./telegram.ts');
  assert.equal(locationReply({ lat: 1, lng: 2 }).reply_markup?.inline_keyboard[0][0].url, 'https://t.me/shop_bot?startapp=cart');
  assert.equal(botChatLink(), 'https://t.me/shop_bot');
});
