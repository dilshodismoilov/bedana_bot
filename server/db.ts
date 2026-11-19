import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env.ts';

export const uploadsDir = join(env.dataDir, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

export const db = new DatabaseSync(join(env.dataDir, 'shop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Append-only list. Never edit an entry that has shipped; add a new one instead.
// PRAGMA user_version stores how many have been applied.
const migrations = [
  `
  CREATE TABLE products (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    price      INTEGER NOT NULL,
    image      TEXT    NOT NULL, -- file name inside DATA_DIR/uploads
    created_at TEXT    NOT NULL
  );
  CREATE TABLE orders (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    name          TEXT    NOT NULL,
    phone         TEXT    NOT NULL,
    address       TEXT    NOT NULL,
    total         INTEGER NOT NULL,
    paid_at       TEXT,
    tg_message_id INTEGER, -- message in the orders group, edited when payment status changes
    created_at    TEXT    NOT NULL
  );
  CREATE INDEX orders_user ON orders(user_id);
  CREATE TABLE order_items (
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    price      INTEGER NOT NULL,
    qty        INTEGER NOT NULL
  );
  CREATE INDEX order_items_order ON order_items(order_id);
  `,
  // Delivery location (map pin) replaces the free-text address. Older orders keep NULL coordinates.
  `
  ALTER TABLE orders ADD COLUMN lat REAL;
  ALTER TABLE orders ADD COLUMN lng REAL;
  ALTER TABLE orders DROP COLUMN address;
  `,
  // Completion (delivered) is tracked separately from payment.
  `ALTER TABLE orders ADD COLUMN completed_at TEXT;`,
  // Product description and photo gallery: images is a JSON array of file names inside DATA_DIR/uploads, cover first.
  `
  ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';
  ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';
  UPDATE products SET images = json_array(image);
  ALTER TABLE products DROP COLUMN image;
  `,
  // Sale unit (piece or kg). Order items snapshot it like name and price; their qty can be fractional for kg.
  `
  ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'piece';
  ALTER TABLE order_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'piece';
  `,
  // Optional pack for products sold by the piece: pieces per pack and the pack's own price. Order items use unit 'pack'.
  `
  ALTER TABLE products ADD COLUMN pack_size INTEGER;
  ALTER TABLE products ADD COLUMN pack_price INTEGER;
  `,
  // Pickup branch or delivery area (a Fulfillment id from shared/delivery.ts). Pickup orders have no lat/lng.
  `ALTER TABLE orders ADD COLUMN fulfillment TEXT;`,
  // What the pack is called (a PackUnit: 'pack' = pachka, 'box' = korobka). Order items of a box use unit 'box'.
  `ALTER TABLE products ADD COLUMN pack_unit TEXT NOT NULL DEFAULT 'pack';`,
];

const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
for (let v = user_version; v < migrations.length; v++) {
  tx(() => {
    db.exec(migrations[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
  });
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
