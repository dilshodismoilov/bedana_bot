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

const HERE = { lat: 41.3, lng: 69.24 };

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

const photo = () => new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });

/** `images`: a new file per `'new'`, or a URL the product already has. */
const productForm = (name: string, price: number, images: ('new' | string)[] = ['new'], description = '', unit = 'piece') => {
  const f = new FormData();
  f.set('name', name);
  f.set('price', String(price));
  f.set('unit', unit);
  f.set('description', description);
  for (const i of images) f.append('images', i === 'new' ? photo() : i);
  return f;
};

test('product CRUD, order with server-side pricing, paid toggle', async () => {
  const created = await call('POST', '/products', productForm('Bedana tuxumi', 1500));
  assert.equal(created.status, 201);
  assert.equal(created.body.images.length, 1);
  assert.match(created.body.images[0], /^\/uploads\/.+\.jpg$/);
  assert.equal((await app.request(created.body.images[0])).status, 200);

  assert.equal((await call('POST', '/products', productForm('No image', 10, []))).status, 400);

  const updated = await call('PUT', `/products/${created.body.id}`, productForm('Bedana tuxumi', 1600, created.body.images));
  assert.equal(updated.body.price, 1600);
  assert.deepEqual(updated.body.images, created.body.images);
  assert.deepEqual(Object.keys(created.body).sort(), ['description', 'id', 'images', 'name', 'price', 'unit'], 'no internal fields leak');

  const order = await call('POST', '/orders', {
    name: 'Ali',
    phone: '+998 90 123 45 67',
    location: { lat: 41.311081, lng: 69.240562 },
    items: [{ productId: created.body.id, qty: 30 }],
  });
  assert.equal(order.status, 201);
  assert.equal(order.body.total, 48000);
  assert.deepEqual(order.body.items, [{ productId: created.body.id, name: 'Bedana tuxumi', price: 1600, unit: 'piece', qty: 30 }]);

  const me = await call('GET', '/me');
  assert.deepEqual(me.body, { isAdmin: true, ordersCount: 1, contact: { name: 'Ali', phone: '+998 90 123 45 67', location: { lat: 41.311081, lng: 69.240562 } } });

  const paid = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  assert.ok(paid.body.paidAt);

  // Deleting a product keeps the order's snapshot.
  assert.equal((await call('DELETE', `/products/${created.body.id}`)).status, 200);
  const after = await call('GET', `/orders/${order.body.id}`);
  assert.equal(after.body.items[0].productId, null);
  assert.equal(after.body.items[0].name, 'Bedana tuxumi');

  const stale = await call('POST', '/orders', { name: 'A', phone: '1', location: HERE, items: [{ productId: created.body.id, qty: 1 }] });
  assert.equal(stale.status, 400);
});

test('products sold by the kilogram take 100 g steps; pieces stay whole', async () => {
  const meat = await call('POST', '/products', productForm("Bedana go'shti", 85_000, ['new'], '', 'kg'));
  assert.equal(meat.body.unit, 'kg');
  const eggs = await call('POST', '/products', productForm('Tuxum', 1500));
  assert.equal(eggs.body.unit, 'piece');
  assert.equal((await call('POST', '/products', productForm('X', 1, ['new'], '', 'litr'))).status, 400);

  const place = (items: { productId: number; qty: unknown }[]) => call('POST', '/orders', { name: 'A', phone: '1', location: HERE, items });
  const order = await place([
    { productId: meat.body.id, qty: 1.5 },
    { productId: eggs.body.id, qty: 10 },
  ]);
  assert.equal(order.status, 201);
  assert.equal(order.body.total, 85_000 * 1.5 + 15_000);
  assert.deepEqual(
    order.body.items.map((i: any) => [i.unit, i.qty]),
    [['kg', 1.5], ['piece', 10]],
  );

  // A half so'm is rounded per line.
  const odd = await call('POST', '/products', productForm('Odd', 1235, ['new'], '', 'kg'));
  assert.equal((await place([{ productId: odd.body.id, qty: 0.3 }])).body.total, 371); // 370.5

  for (const [productId, qty] of [
    [eggs.body.id, 1.5],
    [meat.body.id, 1.25],
    [meat.body.id, 0],
    [meat.body.id, '2'],
  ] as const) {
    assert.equal((await place([{ productId, qty }])).status, 400, `${qty} of ${productId}`);
  }

  // Order items keep the unit they were sold in after the product changes.
  await call('PUT', `/products/${meat.body.id}`, productForm("Bedana go'shti", 85_000, meat.body.images));
  assert.deepEqual((await call('GET', `/orders/${order.body.id}`)).body.items[0].unit, 'kg');
});

test('product gallery: add, reorder and remove photos; description', async () => {
  const p = await call('POST', '/products', productForm('Bedana', 100, ['new', 'new', 'new'], '  Yangi\r\ntuxum  '));
  assert.equal(p.status, 201);
  assert.equal(p.body.description, 'Yangi\ntuxum', 'trimmed, line breaks normalized');
  const [a, b, c] = p.body.images;
  assert.equal(new Set(p.body.images).size, 3);

  // Move the last photo first, drop the middle one, add a new one at the end.
  const edited = await call('PUT', `/products/${p.body.id}`, productForm('Bedana', 100, [c, a, 'new']));
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.body.images.slice(0, 2), [c, a]);
  assert.equal(edited.body.images.length, 3);
  assert.equal((await app.request(b)).status, 404, 'removed photo is deleted from disk');

  const update = (images: string[]) => call('PUT', `/products/${p.body.id}`, productForm('Bedana', 100, images));
  assert.equal((await update([b])).status, 400, 'a photo of the product that was removed');
  assert.equal((await update([a, a])).status, 400, 'the same photo twice');
  assert.equal((await update(['/uploads/../shop.db'])).status, 400, 'not a photo of this product');
  assert.equal((await update(Array(11).fill('new'))).status, 400, 'too many photos');
  assert.deepEqual((await call('GET', '/products')).body.find((x: any) => x.id === p.body.id).images, edited.body.images, 'rejected edits change nothing');

  assert.equal((await call('DELETE', `/products/${p.body.id}`)).status, 200);
  for (const url of edited.body.images) assert.equal((await app.request(url)).status, 404);
});

test('customers cannot use admin endpoints or see other customers orders', async () => {
  const product = await call('POST', '/products', productForm('Tovuq tuxumi', 1800));
  const asCustomer = (id: number) => ({ 'x-dev-user': String(id), 'content-type': 'application/json' });
  const order = await app.request('/api/orders', {
    method: 'POST',
    headers: asCustomer(7),
    body: JSON.stringify({ name: 'A', phone: '+998901234567', location: HERE, items: [{ productId: product.body.id, qty: 2, price: 1 }] }),
  });
  const created = (await order.json()) as any;
  assert.equal(created.total, 3600, 'client-sent price is ignored');

  for (const [method, path] of [
    ['GET', '/api/admin/orders'],
    ['PUT', `/api/orders/${created.id}/paid`],
    ['PUT', `/api/orders/${created.id}/completed`],
    ['DELETE', `/api/products/${product.body.id}`],
  ]) {
    const res = await app.request(path, { method, headers: asCustomer(7), body: method === 'PUT' ? '{"paid":true}' : undefined });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
  assert.equal((await app.request(`/api/orders/${created.id}`, { headers: asCustomer(8) })).status, 404);
  assert.equal((await app.request(`/api/orders/${created.id}`, { headers: asCustomer(7) })).status, 200);
});

test('marking an order paid twice keeps the first payment time', async () => {
  const product = await call('POST', '/products', productForm('Bedana', 100));
  const order = await call('POST', '/orders', { name: 'A', phone: '+998901234567', location: HERE, items: [{ productId: product.body.id, qty: 1 }] });
  const first = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  await new Promise((r) => setTimeout(r, 5));
  const second = await call('PUT', `/orders/${order.body.id}/paid`, { paid: true });
  assert.equal(second.body.paidAt, first.body.paidAt);
  assert.equal((await call('PUT', `/orders/${order.body.id}/paid`, { paid: false })).body.paidAt, null);
});

test('completed is independent of paid; admin list shows open orders before closed ones', async () => {
  const product = await call('POST', '/products', productForm('Bedana', 100));
  const place = async () =>
    (await call('POST', '/orders', { name: 'A', phone: '+998901234567', location: HERE, items: [{ productId: product.body.id, qty: 1 }] })).body;
  const closed = await place();
  const deliveredUnpaid = await place();
  const fresh = await place();

  await call('PUT', `/orders/${closed.id}/paid`, { paid: true });
  const closedNow = await call('PUT', `/orders/${closed.id}/completed`, { completed: true });
  assert.ok(closedNow.body.paidAt && closedNow.body.completedAt);

  const delivered = await call('PUT', `/orders/${deliveredUnpaid.id}/completed`, { completed: true });
  assert.ok(delivered.body.completedAt);
  assert.equal(delivered.body.paidAt, null, 'completing does not mark paid');

  const ids = (await call('GET', '/admin/orders')).body.map((o: any) => o.id);
  const pos = (id: number) => ids.indexOf(id);
  assert.ok(pos(closed.id) > pos(deliveredUnpaid.id) && pos(closed.id) > pos(fresh.id), 'closed order is listed after open ones');

  const undone = await call('PUT', `/orders/${deliveredUnpaid.id}/completed`, { completed: false });
  assert.equal(undone.body.completedAt, null);
  assert.equal((await call('PUT', '/orders/99999/completed', { completed: true })).status, 404);
});

test('order validation', async () => {
  const res = await call('POST', '/orders', { name: '', phone: '1', location: HERE, items: [{ productId: 1, qty: 1 }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Ismingizni kiriting');

  const order = (location: unknown) => call('POST', '/orders', { name: 'A', phone: '+998901234567', location, items: [{ productId: 1, qty: 1 }] });
  for (const bad of [undefined, null, {}, { lat: 41 }, { lat: 91, lng: 69 }, { lat: 41, lng: 181 }, { lat: 'x', lng: 69 }]) {
    const r = await order(bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.body.error, 'Yetkazib berish joyini xaritada belgilang');
  }
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
