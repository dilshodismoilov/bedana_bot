// End-to-end API tests against a throwaway database. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DEV = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'shop-test-'));
process.env.BOT_TOKEN = '';
process.env.GROUP_ID = '';

const { app } = await import('./app.ts');
const { verifyInitData } = await import('./auth.ts');

const call = async (method: string, path: string, body?: unknown) => {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await app.request(`/api${path}`, init);
  return { status: res.status, body: (await res.json()) as any };
};

const productForm = (name: string, price: number, withImage = true) => {
  const f = new FormData();
  f.set('name', name);
  f.set('price', String(price));
  if (withImage) f.set('image', new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }));
  return f;
};

test('product CRUD, order with server-side pricing, paid toggle', async () => {
  const created = await call('POST', '/products', productForm('Bedana tuxumi', 1500));
  assert.equal(created.status, 201);
  assert.match(created.body.image, /^\/uploads\/.+\.jpg$/);

  const image = await app.request(created.body.image);
  assert.equal(image.status, 200);

  assert.equal((await call('POST', '/products', productForm('No image', 10, false))).status, 400);

  const updated = await call('PUT', `/products/${created.body.id}`, productForm('Bedana tuxumi', 1600, false));
  assert.equal(updated.body.price, 1600);
  assert.equal(updated.body.image, created.body.image);
  assert.deepEqual(Object.keys(created.body).sort(), ['id', 'image', 'name', 'price'], 'no internal fields leak');

  const order = await call('POST', '/orders', {
    name: 'Ali',
    phone: '+998 90 123 45 67',
    address: 'Toshkent',
    items: [{ productId: created.body.id, qty: 30 }],
  });
  assert.equal(order.status, 201);
  assert.equal(order.body.total, 48000);
  assert.deepEqual(order.body.items, [{ productId: created.body.id, name: 'Bedana tuxumi', price: 1600, qty: 30 }]);

  const me = await call('GET', '/me');
  assert.deepEqual(me.body, { isAdmin: true, ordersCount: 1, contact: { name: 'Ali', phone: '+998 90 123 45 67', address: 'Toshkent' } });

  const paid = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  assert.ok(paid.body.paidAt);

  // Deleting a product keeps the order's snapshot.
  assert.equal((await call('DELETE', `/products/${created.body.id}`)).status, 200);
  const after = await call('GET', `/orders/${order.body.id}`);
  assert.equal(after.body.items[0].productId, null);
  assert.equal(after.body.items[0].name, 'Bedana tuxumi');

  const stale = await call('POST', '/orders', { name: 'A', phone: '1', address: 'B', items: [{ productId: created.body.id, qty: 1 }] });
  assert.equal(stale.status, 400);
});

test('customers cannot use admin endpoints or see other customers orders', async () => {
  const product = await call('POST', '/products', productForm('Tovuq tuxumi', 1800));
  const asCustomer = (id: number) => ({ 'x-dev-user': String(id), 'content-type': 'application/json' });
  const order = await app.request('/api/orders', {
    method: 'POST',
    headers: asCustomer(7),
    body: JSON.stringify({ name: 'A', phone: '+998901234567', address: 'B', items: [{ productId: product.body.id, qty: 2, price: 1 }] }),
  });
  const created = (await order.json()) as any;
  assert.equal(created.total, 3600, 'client-sent price is ignored');

  for (const [method, path] of [['GET', '/api/admin/orders'], ['PUT', `/api/orders/${created.id}/paid`], ['DELETE', `/api/products/${product.body.id}`]]) {
    const res = await app.request(path, { method, headers: asCustomer(7), body: method === 'PUT' ? '{"paid":true}' : undefined });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.equal((await app.request(`/api/orders/${created.id}`, { headers: asCustomer(8) })).status, 404);
  assert.equal((await app.request(`/api/orders/${created.id}`, { headers: asCustomer(7) })).status, 200);
});

test('marking an order paid twice keeps the first payment time', async () => {
  const product = await call('POST', '/products', productForm('Bedana', 100));
  const order = await call('POST', '/orders', { name: 'A', phone: '+998901234567', address: 'B', items: [{ productId: product.body.id, qty: 1 }] });
  const first = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  await new Promise((r) => setTimeout(r, 5));
  const second = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  assert.equal(second.body.paidAt, first.body.paidAt);
  assert.equal((await call('PUT', `/orders/${order.body.id}/paid`, { paid: false })).body.paidAt, null);
});

test('order validation', async () => {
  const res = await call('POST', '/orders', { name: '', phone: '1', address: 'x', items: [{ productId: 1, qty: 1 }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Ismingizni kiriting');
});

test('verifyInitData accepts genuine data and rejects tampering/expiry', () => {
  const token = '123:ABC';
  const authDate = 1_700_000_000;
  const fields: Record<string, string> = { auth_date: String(authDate), query_id: 'q', user: JSON.stringify({ id: 42, first_name: 'Ali' }) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  const initData = new URLSearchParams({ ...fields, hash }).toString();

  const now = authDate * 1000 + 1000;
  assert.equal(verifyInitData(initData, token, now)?.id, 42);
  assert.equal(verifyInitData(initData.replace('Ali', 'Bob'), token, now), null);
  assert.equal(verifyInitData(initData, 'other:TOKEN', now), null);
  assert.equal(verifyInitData(initData, token, now + 2 * 86400_000), null);
});
