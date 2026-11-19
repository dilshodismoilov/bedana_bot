// All SQL lives here. Functions return shared types, never raw rows.
import type { Contact, LatLng, NewOrder, Order, OrderItem, OrderStatus, Pack, Product, Unit } from '../shared/types.ts';
import { lineTotal, normalizeQty, UNIT_LABEL } from '../shared/units.ts';
import { db, tx } from './db.ts';

type Row = Record<string, any>;

const toProduct = (r: Row): Product => ({
  id: r.id,
  name: r.name,
  price: r.price || null, // stored as 0 when sold only in packs (the column is NOT NULL)
  unit: r.unit,
  pack: r.pack_size ? { size: r.pack_size, price: r.pack_price, unit: r.pack_unit } : null,
  description: r.description,
  images: (JSON.parse(r.images) as string[]).map((f) => `/uploads/${f}`),
});

const toItem = (r: Row): OrderItem => ({
  productId: r.product_id,
  name: r.name,
  price: r.price,
  unit: r.unit,
  qty: r.qty,
});

const toLocation = (r: Row): LatLng | null => (r.lat == null || r.lng == null ? null : { lat: r.lat, lng: r.lng });

const toOrder = (r: Row): Order => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  phone: r.phone,
  fulfillment: r.fulfillment,
  location: toLocation(r),
  total: r.total,
  paidAt: r.paid_at,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  items: (db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid').all(r.id) as Row[]).map(toItem),
});

/** Thrown for problems the user can fix; the API returns it as 400 with this message. */
export class UserError extends Error {}

// ---------- products ----------

export function listProducts(): Product[] {
  return (db.prepare('SELECT * FROM products ORDER BY id').all() as Row[]).map(toProduct);
}

export function getProduct(id: number): Product | null {
  const r = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Row | undefined;
  return r ? toProduct(r) : null;
}

/** File names inside DATA_DIR/uploads, or null if there is no such product. Server-only; never sent to clients. */
export function getProductImageFiles(id: number): string[] | null {
  const r = db.prepare('SELECT images FROM products WHERE id = ?').get(id) as Row | undefined;
  return r ? JSON.parse(r.images) : null;
}

type ProductInput = { name: string; price: number | null; unit: Unit; pack: Pack | null; description: string; imageFiles: string[] };

export function createProduct(p: ProductInput): Product {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO products (name, price, unit, pack_size, pack_price, pack_unit, description, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.name, p.price ?? 0, p.unit, p.pack?.size ?? null, p.pack?.price ?? null, p.pack?.unit ?? 'pack', p.description, JSON.stringify(p.imageFiles), new Date().toISOString());
  return getProduct(Number(lastInsertRowid))!;
}

export function updateProduct(id: number, p: ProductInput): Product {
  db.prepare('UPDATE products SET name = ?, price = ?, unit = ?, pack_size = ?, pack_price = ?, pack_unit = ?, description = ?, images = ? WHERE id = ?').run(
    p.name,
    p.price ?? 0,
    p.unit,
    p.pack?.size ?? null,
    p.pack?.price ?? null,
    p.pack?.unit ?? 'pack',
    p.description,
    JSON.stringify(p.imageFiles),
    id,
  );
  return getProduct(id)!;
}

export function deleteProduct(id: number): void {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

// ---------- orders ----------

export function createOrder(userId: number, input: NewOrder): Order {
  return tx(() => {
    const items = input.items.map(({ productId, qty, pack }) => {
      const p = getProduct(productId);
      if (!p) throw new UserError("Savatdagi mahsulot endi mavjud emas. Savatni yangilang.");
      if (pack && !p.pack) throw new UserError(`"${p.name}" endi bunday sotilmaydi. Savatni yangilang.`);
      if (!pack && p.price === null) throw new UserError(`"${p.name}" faqat ${UNIT_LABEL[p.pack!.unit]}da sotiladi. Savatni yangilang.`);
      const unit = pack ? p.pack!.unit : p.unit;
      // Checked against the product's current unit, so 1.5 is rejected for a product sold by the piece.
      const n = normalizeQty(qty, unit);
      if (n === null) throw new UserError(`"${p.name}" miqdori noto'g'ri`);
      return { productId, name: p.name, price: pack ? p.pack!.price : p.price!, unit, qty: n };
    });
    const total = items.reduce((sum, i) => sum + lineTotal(i.price, i.qty), 0);

    const { lastInsertRowid } = db
      .prepare('INSERT INTO orders (user_id, name, phone, fulfillment, lat, lng, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, input.name, input.phone, input.fulfillment, input.location?.lat ?? null, input.location?.lng ?? null, total, new Date().toISOString());
    const orderId = Number(lastInsertRowid);

    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, unit, qty) VALUES (?, ?, ?, ?, ?, ?)');
    for (const i of items) insertItem.run(orderId, i.productId, i.name, i.price, i.unit, i.qty);

    return getOrder(orderId)!;
  });
}

export function getOrder(id: number): Order | null {
  const r = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined;
  return r ? toOrder(r) : null;
}

export function listUserOrders(userId: number): Order[] {
  return (db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId) as Row[]).map(toOrder);
}

/** Every open order (unpaid or not completed), then the most recently closed ones (paid and completed). */
export function listAdminOrders(closedLimit = 50): Order[] {
  const open = db.prepare('SELECT * FROM orders WHERE paid_at IS NULL OR completed_at IS NULL ORDER BY id DESC').all() as Row[];
  const closed = db
    .prepare('SELECT * FROM orders WHERE paid_at IS NOT NULL AND completed_at IS NOT NULL ORDER BY id DESC LIMIT ?')
    .all(closedLimit) as Row[];
  return [...open, ...closed].map(toOrder);
}

const STATUS_COLUMN: Record<OrderStatus, string> = { paid: 'paid_at', completed: 'completed_at' };

/** Switches a status on (records the time) or off. */
export function setOrderStatus(id: number, status: OrderStatus, on: boolean): Order | null {
  const column = STATUS_COLUMN[status];
  // COALESCE keeps the first time if two admins switch it on at once.
  if (on) db.prepare(`UPDATE orders SET ${column} = COALESCE(${column}, ?) WHERE id = ?`).run(new Date().toISOString(), id);
  else db.prepare(`UPDATE orders SET ${column} = NULL WHERE id = ?`).run(id);
  return getOrder(id);
}

export function setOrderMessageId(id: number, messageId: number): void {
  db.prepare('UPDATE orders SET tg_message_id = ? WHERE id = ?').run(messageId, id);
}

export function getOrderMessageId(id: number): number | null {
  const r = db.prepare('SELECT tg_message_id FROM orders WHERE id = ?').get(id) as Row | undefined;
  return r?.tg_message_id ?? null;
}

export function userStats(userId: number): { ordersCount: number; contact: Contact | null } {
  const r = db
    .prepare('SELECT name, phone, fulfillment, lat, lng, (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS n FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId, userId) as Row | undefined;
  return r ? { ordersCount: r.n, contact: { name: r.name, phone: r.phone, fulfillment: r.fulfillment, location: toLocation(r) } } : { ordersCount: 0, contact: null };
}
