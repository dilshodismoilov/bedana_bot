// Types shared by server and web. Money is always integer so'm.
import type { Fulfillment } from './delivery.ts';

/** How a product is sold and priced: per piece, or per kilogram (quantities in 100 g steps). See units.ts. */
export type Unit = 'piece' | 'kg';

/** What a pack is called: pachka or korobka. Same rules for both; only the word differs. */
export type PackUnit = 'pack' | 'box';

/** How an order line is sold: in the product's unit, or in packs (only products sold by the piece have packs). */
export type SaleUnit = Unit | PackUnit;

export type Pack = { size: number; price: number; unit: PackUnit }; // pieces per pack, price of one pack, its name

export type Product = {
  id: number;
  name: string;
  price: number | null; // per unit; null when the product is sold only in packs
  unit: Unit;
  pack: Pack | null; // a pack of pieces sold at its own price; null when the product has none
  description: string; // may be empty
  images: string[]; // URL paths, e.g. /uploads/abc.jpg; at least one, the first is the cover
};

export type LatLng = { lat: number; lng: number };

export type Contact = {
  name: string;
  phone: string;
  fulfillment: Fulfillment | null; // pickup branch or delivery area (see delivery.ts); null only on orders from before it existed
};

export type OrderItem = {
  productId: number | null; // null once the product is deleted; name/price are snapshots
  name: string;
  price: number;
  unit: SaleUnit;
  qty: number; // whole for pieces and packs, may have a decimal for kg
};

export type Order = Contact & {
  id: number;
  // Delivery point. The customer sends it in the bot chat after ordering, so it is null until then; always null for pickup.
  location: LatLng | null;
  userId: number; // Telegram user id of the customer
  items: OrderItem[];
  total: number;
  paidAt: string | null; // ISO
  completedAt: string | null; // ISO; delivered/handed over. Independent of payment.
  createdAt: string; // ISO
};

/** Order statuses an admin can switch on and off. */
export type OrderStatus = 'paid' | 'completed';

export type NewOrder = Omit<Contact, 'fulfillment'> & {
  fulfillment: Fulfillment;
  items: { productId: number; qty: number; pack?: boolean }[]; // pack: qty is a number of packs
};

export type Me = {
  isAdmin: boolean;
  ordersCount: number;
  contact: Contact | null; // from the user's latest order, used to prefill checkout
};
