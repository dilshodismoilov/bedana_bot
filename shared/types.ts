// Types shared by server and web. Money is always integer so'm.

export type Product = {
  id: number;
  name: string;
  price: number; // per piece
  description: string; // may be empty
  images: string[]; // URL paths, e.g. /uploads/abc.jpg; at least one, the first is the cover
};

export type LatLng = { lat: number; lng: number };

export type Contact = {
  name: string;
  phone: string;
  location: LatLng | null; // delivery point; required for new orders, null only on orders from before locations existed
};

export type OrderItem = {
  productId: number | null; // null once the product is deleted; name/price are snapshots
  name: string;
  price: number;
  qty: number;
};

export type Order = Contact & {
  id: number;
  userId: number; // Telegram user id of the customer
  items: OrderItem[];
  total: number;
  paidAt: string | null; // ISO
  completedAt: string | null; // ISO; delivered/handed over. Independent of payment.
  createdAt: string; // ISO
};

/** Order statuses an admin can switch on and off. */
export type OrderStatus = 'paid' | 'completed';

export type NewOrder = Omit<Contact, 'location'> & {
  location: LatLng;
  items: { productId: number; qty: number }[];
};

export type Me = {
  isAdmin: boolean;
  ordersCount: number;
  contact: Contact | null; // from the user's latest order, used to prefill checkout
};
