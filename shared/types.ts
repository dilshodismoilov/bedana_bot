// Types shared by server and web. Money is always integer so'm.

export type Product = {
  id: number;
  name: string;
  price: number; // per piece
  image: string; // URL path, e.g. /uploads/abc.jpg
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
  createdAt: string; // ISO
};

export type NewOrder = Omit<Contact, 'location'> & {
  location: LatLng;
  items: { productId: number; qty: number }[];
};

export type Me = {
  isAdmin: boolean;
  ordersCount: number;
  contact: Contact | null; // from the user's latest order, used to prefill checkout
};
