import { effect, signal } from '@preact/signals';
import type { Contact, Product, SaleUnit } from '../../shared/types.ts';
import { lineTotal } from '../../shared/units.ts';

// Sale option key (see saleOptions) -> qty. Persisted per device.
export const cart = signal<Record<string, number>>(read('cart', {}));
effect(() => write('cart', cart.value));

// Checkout form, kept across navigation and app restarts.
// Merged onto defaults so drafts saved by older versions (which had an address field) still load.
export const draft = signal<Contact>({ name: '', phone: '', fulfillment: null, location: null, ...read<Partial<Contact>>('draft', {}) });
effect(() => write('draft', draft.value));

/** One way to buy a product: in its unit, or by the pack. `key` identifies it in the cart. */
export type SaleOption = { key: string; unit: SaleUnit; price: number; pack: boolean };

export const saleOptions = (p: Product): SaleOption[] => [
  ...(p.price !== null ? [{ key: String(p.id), unit: p.unit, price: p.price, pack: false }] : []),
  ...(p.pack ? [{ key: `${p.id}:pack`, unit: 'pack' as const, price: p.pack.price, pack: true }] : []),
];

export function setQty(key: string, qty: number) {
  const next = { ...cart.value };
  if (qty > 0) next[key] = qty;
  else delete next[key];
  cart.value = next;
}

export const clearCart = () => (cart.value = {});

export type CartLine = SaleOption & { product: Product; qty: number };

/** Cart lines for products (and packs) that still exist. */
export const cartLines = (products: Product[]): CartLine[] =>
  products.flatMap((product) => saleOptions(product).filter((o) => cart.value[o.key]).map((o) => ({ ...o, product, qty: cart.value[o.key] })));

export const linesTotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + lineTotal(l.price, l.qty), 0);

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
