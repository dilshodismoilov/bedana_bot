import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Me, NewOrder, OrderStatus } from '../shared/types.ts';
import { adminOnly, auth, isAdmin, type AuthEnv } from './auth.ts';
import { uploadsDir } from './db.ts';
import * as store from './store.ts';
import { announceOrder, notifyCustomer, refreshOrderMessage } from './telegram.ts';

export const api = new Hono<AuthEnv>();

api.onError((err, c) => {
  if (err instanceof store.UserError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: 'Serverda xatolik' }, 500);
});

api.use('*', auth);

api.get('/me', async (c) => {
  const { id } = c.get('user');
  const me: Me = { isAdmin: await isAdmin(id), ...store.userStats(id) };
  return c.json(me);
});

// ---------- products ----------

api.get('/products', (c) => c.json(store.listProducts()));

const imageUpload = bodyLimit({ maxSize: 10 * 1024 * 1024, onError: (c) => c.json({ error: 'Rasm juda katta' }, 413) });

api.post('/products', adminOnly, imageUpload, async (c) => {
  const body = await c.req.parseBody();
  const fields = productFields(body);
  const imageFile = await saveImage(body.image);
  return c.json(store.createProduct({ ...fields, imageFile }), 201);
});

api.put('/products/:id', adminOnly, imageUpload, async (c) => {
  const id = Number(c.req.param('id'));
  const oldImage = store.getProductImageFile(id);
  if (!oldImage) return c.json({ error: 'Mahsulot topilmadi' }, 404);
  const body = await c.req.parseBody();
  const fields = productFields(body);
  const imageFile = body.image instanceof File ? await saveImage(body.image) : oldImage;
  const product = store.updateProduct(id, { ...fields, imageFile });
  if (imageFile !== oldImage) await removeImage(oldImage);
  return c.json(product);
});

api.delete('/products/:id', adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const image = store.getProductImageFile(id);
  if (!image) return c.json({ error: 'Mahsulot topilmadi' }, 404);
  store.deleteProduct(id);
  await removeImage(image);
  return c.json({ ok: true });
});

// ---------- orders ----------

api.get('/orders', (c) => c.json(store.listUserOrders(c.get('user').id)));

api.get('/admin/orders', adminOnly, (c) => c.json(store.listAdminOrders()));

api.get('/orders/:id', async (c) => {
  const order = store.getOrder(Number(c.req.param('id')));
  const { id } = c.get('user');
  if (!order || (order.userId !== id && !(await isAdmin(id)))) return c.json({ error: 'Buyurtma topilmadi' }, 404);
  return c.json(order);
});

api.post('/orders', async (c) => {
  const input = parseNewOrder(await c.req.json().catch(() => null));
  const order = store.createOrder(c.get('user').id, input);
  announceOrder(order).catch((e) => console.error('[telegram] announce failed', e));
  notifyCustomer(order).catch((e) => console.error('[telegram] customer message failed', e));
  return c.json(order, 201);
});

// PUT /orders/:id/paid {paid: boolean} and PUT /orders/:id/completed {completed: boolean}
for (const status of ['paid', 'completed'] as const satisfies readonly OrderStatus[]) {
  api.put(`/orders/:id/${status}`, adminOnly, async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const order = store.setOrderStatus(Number(c.req.param('id')), status, body[status] === true);
    if (!order) return c.json({ error: 'Buyurtma topilmadi' }, 404);
    refreshOrderMessage(order).catch((e) => console.error('[telegram] refresh failed', e));
    return c.json(order);
  });
}

// ---------- validation helpers ----------

function text(value: unknown, max: number, message: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s || s.length > max) throw new store.UserError(message);
  return s;
}

function int(value: unknown, min: number, max: number, message: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new store.UserError(message);
  return n;
}

function location(value: any): { lat: number; lng: number } {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  const ok = value?.lat != null && value?.lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!ok) throw new store.UserError("Yetkazib berish joyini xaritada belgilang");
  return { lat, lng };
}

function productFields(body: Record<string, unknown>) {
  return {
    name: text(body.name, 100, 'Nomini kiriting'),
    price: int(body.price, 1, 1_000_000_000, 'Narxni kiriting'),
  };
}

function parseNewOrder(body: any): NewOrder {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > 100) throw new store.UserError("Savat bo'sh");
  return {
    name: text(body.name, 100, 'Ismingizni kiriting'),
    phone: text(body.phone, 30, 'Telefon raqamingizni kiriting'),
    location: location(body.location),
    items: items.map((i: any) => ({
      productId: int(i?.productId, 1, Number.MAX_SAFE_INTEGER, 'Savatda xatolik'),
      qty: int(i?.qty, 1, 100_000, "Miqdor noto'g'ri"),
    })),
  };
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function saveImage(file: unknown): Promise<string> {
  if (!(file instanceof File)) throw new store.UserError('Rasm tanlang');
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new store.UserError("Rasm JPG, PNG yoki WEBP bo'lishi kerak");
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

async function removeImage(name: string) {
  await unlink(join(uploadsDir, name)).catch(() => {});
}
