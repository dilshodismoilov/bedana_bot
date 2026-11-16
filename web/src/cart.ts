import { effect, signal } from '@preact/signals';
import type { Contact, Product } from '../../shared/types.ts';

// productId -> qty. Persisted per device.
export const cart = signal<Record<number, number>>(read('cart', {}));
effect(() => write('cart', cart.value));

// Checkout form, kept across navigation and app restarts.
export const draft = signal<Contact>(read('draft', { name: '', phone: '', address: '' }));
effect(() => write('draft', draft.value));

export function setQty(productId: number, qty: number) {
  const next = { ...cart.value };
  if (qty > 0) next[productId] = qty;
  else delete next[productId];
  cart.value = next;
}

export const clearCart = () => (cart.value = {});

/** Cart lines for products that still exist. */
export function cartLines(products: Product[]) {
  return products.filter((p) => cart.value[p.id]).map((product) => ({ product, qty: cart.value[product.id] }));
}

export const linesTotal = (lines: { product: Product; qty: number }[]) =>
  lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);

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
