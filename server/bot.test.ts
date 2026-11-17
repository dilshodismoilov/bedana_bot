// Command parsing for incoming bot messages. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEV = '1';
process.env.GROUP_ID = '-1001234567890';
const { isCommand, hereReply } = await import('./bot.ts');

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
