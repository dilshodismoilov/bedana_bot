import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isFulfillment, pickupBranch } from '../shared/delivery.ts';
import type { LatLng, Me, NewOrder, OrderStatus, Pack } from '../shared/types.ts';
import { isUnit, MAX_QTY } from '../shared/units.ts';
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

// Up to MAX_IMAGES cropped JPEGs (about 0.3 MB each) per request.
const imageUpload = bodyLimit({ maxSize: 30 * 1024 * 1024, onError: (c) => c.json({ error: 'Rasmlar juda katta' }, 413) });

// Products are sent as multipart forms. `images` is repeated, in display order: a File for a new photo,
// or the URL of a photo the product already has to keep it.
api.post('/products', adminOnly, imageUpload, async (c) => {
  const body = await c.req.parseBody({ all: true });
  const fields = productFields(body);
  const imageFiles = await saveImages(body.images, []);
  return c.json(store.createProduct({ ...fields, imageFiles }), 201);
});

api.put('/products/:id', adminOnly, imageUpload, async (c) => {
  const id = Number(c.req.param('id'));
  const oldImages = store.getProductImageFiles(id);
  if (!oldImages) return c.json({ error: 'Mahsulot topilmadi' }, 404);
  const body = await c.req.parseBody({ all: true });
  const fields = productFields(body);
  const imageFiles = await saveImages(body.images, oldImages);
  const product = store.updateProduct(id, { ...fields, imageFiles });
  await removeImages(oldImages.filter((f) => !imageFiles.includes(f)));
  return c.json(product);
});

api.delete('/products/:id', adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const images = store.getProductImageFiles(id);
  if (!images) return c.json({ error: 'Mahsulot topilmadi' }, 404);
  store.deleteProduct(id);
  await removeImages(images);
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

const fail = (message: string): never => {
  throw new store.UserError(message);
};

/** Optional pack: both fields empty means none. */
function pack(size: unknown, price: unknown): Pack | null {
  if (!size && !price) return null;
  return {
    size: int(size, 2, MAX_QTY, 'Pachkadagi sonini kiriting'),
    price: int(price, 1, 1_000_000_000, 'Pachka narxini kiriting'),
  };
}

function quantity(value: unknown): number {
  if (typeof value !== 'number' || !(value > 0 && value <= MAX_QTY)) throw new store.UserError("Miqdor noto'g'ri");
  return value;
}

function location(value: any): LatLng {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  const ok = value?.lat != null && value?.lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!ok) throw new store.UserError("Yetkazib berish joyini xaritada belgilang");
  return { lat, lng };
}

function productFields(body: Record<string, unknown>) {
  // Multipart forms send line breaks as \r\n.
  const description = typeof body.description === 'string' ? body.description.replace(/\r\n?/g, '\n').trim() : '';
  if (description.length > 2000) throw new store.UserError('Tavsif juda uzun');
  const unit = isUnit(body.unit) ? body.unit : fail("O'lchov birligini tanlang");
  const packed = unit === 'piece' ? pack(body.packSize, body.packPrice) : null;
  return {
    name: text(body.name, 100, 'Nomini kiriting'),
    // No price per piece means the product is sold only in packs.
    price: packed && !body.price ? null : int(body.price, 1, 1_000_000_000, 'Narxni kiriting'),
    unit,
    pack: packed,
    description,
  };
}

function parseNewOrder(body: any): NewOrder {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > 100) throw new store.UserError("Savat bo'sh");
  const fulfillment = isFulfillment(body.fulfillment) ? body.fulfillment : fail('Olib ketish yoki yetkazib berishni tanlang');
  return {
    name: text(body.name, 100, 'Ismingizni kiriting'),
    phone: text(body.phone, 30, 'Telefon raqamingizni kiriting'),
    fulfillment,
    location: pickupBranch(fulfillment) ? null : location(body.location), // a pickup needs no customer location
    items: items.map((i: any) => ({
      productId: int(i?.productId, 1, Number.MAX_SAFE_INTEGER, 'Savatda xatolik'),
      qty: quantity(i?.qty), // checked against the product's unit when the order is created
      pack: i?.pack === true,
    })),
  };
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGES = 10; // the admin form has the same limit

/** Validates the whole `images` list first, then writes the new files. Returns file names in display order. */
async function saveImages(value: unknown, existing: string[]): Promise<string[]> {
  const entries = value === undefined ? [] : Array.isArray(value) ? value : [value];
  if (!entries.length) throw new store.UserError('Rasm tanlang');
  if (entries.length > MAX_IMAGES) throw new store.UserError(`Ko'pi bilan ${MAX_IMAGES} ta rasm`);
  const kept = new Set<string>();
  for (const e of entries) {
    if (e instanceof File) {
      if (!IMAGE_TYPES[e.type]) throw new store.UserError("Rasm JPG, PNG yoki WEBP bo'lishi kerak");
      continue;
    }
    const name = typeof e === 'string' ? e.replace(/^\/uploads\//, '') : '';
    if (!existing.includes(name) || kept.has(name)) throw new store.UserError('Rasm topilmadi');
    kept.add(name);
  }
  const names: string[] = [];
  for (const e of entries as (File | string)[]) {
    if (typeof e === 'string') {
      names.push(e.replace(/^\/uploads\//, ''));
      continue;
    }
    const name = `${randomUUID()}.${IMAGE_TYPES[e.type]}`;
    await writeFile(join(uploadsDir, name), Buffer.from(await e.arrayBuffer()));
    names.push(name);
  }
  return names;
}

async function removeImages(names: string[]) {
  await Promise.all(names.map((n) => unlink(join(uploadsDir, n)).catch(() => {})));
}
