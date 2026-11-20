// Log levels, Telegram batching and /here in the log group. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEV = '1';
process.env.GROUP_ID = '-1001';
process.env.LOG_GROUP_ID = '-1002';
const { passes, pack, line, who } = await import('./log.ts');
const { hereReply } = await import('./bot.ts');

test('a destination takes its level and everything above', () => {
  assert.equal(passes('debug', 'info'), false);
  assert.equal(passes('info', 'info'), true);
  assert.equal(passes('error', 'warn'), true);
  assert.equal(passes('warn', 'error'), false);
  assert.equal(passes('error', 'off'), false);
});

test('entries are packed into as few messages as fit, in order', () => {
  assert.deepEqual(pack(['a', 'b', 'c'], 10), ['a\nb\nc']);
  assert.deepEqual(pack(['aaaa', 'bbbb', 'cc'], 9), ['aaaa\nbbbb', 'cc']);
  assert.deepEqual(pack([], 10), []);
});

test('a line has the level icon, Tashkent time, and escaped detail', () => {
  assert.match(line('warn', 'slow'), /^⚠️ <code>\d\d:\d\d:\d\d<\/code> slow$/);
  assert.match(line('error', 'boom', 'at <anonymous>'), /\n<pre>at &lt;anonymous&gt;<\/pre>$/);
  assert.equal(who({ id: 5, first_name: 'A<b>', username: 'ab' }), '<a href="tg://user?id=5">A&lt;b&gt;</a> @ab <code>5</code>');
});

test('/here in the log group confirms it receives the logs', () => {
  assert.equal(hereReply(-1002), '<code>LOG_GROUP_ID=-1002</code>\n✅ Loglar shu guruhga keladi');
  assert.match(hereReply(-1001), /^<code>GROUP_ID=-1001<\/code>\n✅ Buyurtmalar/);
});
