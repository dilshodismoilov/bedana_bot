// Sale units and quantity rules, used by the server (validation, totals, bot messages) and the web app.
import type { Unit } from './types.ts';

export const UNIT_LABEL: Record<Unit, string> = { piece: 'dona', kg: 'kg' };

/** Decimal places a quantity may have: whole pieces, kilograms in 100 g steps. */
export const QTY_DECIMALS: Record<Unit, number> = { piece: 0, kg: 1 };

export const MAX_QTY = 100_000;

export const isUnit = (u: unknown): u is Unit => Object.keys(UNIT_LABEL).includes(u as string);

/** The quantity rounded to the unit's step, or null if it isn't a valid amount (or needs more decimals). */
export function normalizeQty(qty: number, unit: Unit): number | null {
  const f = 10 ** QTY_DECIMALS[unit];
  const n = Math.round(qty * f) / f;
  return Number.isFinite(qty) && n > 0 && n <= MAX_QTY && Math.abs(n - qty) < 1e-9 ? n : null;
}

/** Line total in whole so'm (a kilogram price times 1,5 kg can end in a half). */
export const lineTotal = (price: number, qty: number) => Math.round(price * qty);

/** "1,5 kg", "30 dona". The decimal comma is the Uzbek convention. */
export const qtyText = (qty: number, unit: Unit) => `${String(qty).replace('.', ',')} ${UNIT_LABEL[unit]}`;
