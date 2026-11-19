// Sale units and quantity rules, used by the server (validation, totals, bot messages) and the web app.
import type { PackUnit, SaleUnit, Unit } from './types.ts';

export const UNIT_LABEL: Record<SaleUnit, string> = { piece: 'dona', kg: 'kg', pack: 'pachka', box: 'korobka' };

/** Decimal places a quantity may have: whole pieces and packs, kilograms in 100 g steps. */
export const QTY_DECIMALS: Record<SaleUnit, number> = { piece: 0, kg: 1, pack: 0, box: 0 };

export const MAX_QTY = 100_000;

/** Units a product can be priced in ('pack' is an extra option on top of 'piece', not a unit of its own). */
export const PRODUCT_UNITS: Unit[] = ['piece', 'kg'];

export const isUnit = (u: unknown): u is Unit => PRODUCT_UNITS.includes(u as Unit);

/** Names a pack can have, chosen per product. */
export const PACK_UNITS: PackUnit[] = ['pack', 'box'];

export const isPackUnit = (u: unknown): u is PackUnit => PACK_UNITS.includes(u as PackUnit);

/** "Pachka", "Korobka": the label with a capital letter, for the start of a placeholder or message. */
export const capitalLabel = (u: SaleUnit) => UNIT_LABEL[u][0].toUpperCase() + UNIT_LABEL[u].slice(1);

/** The quantity rounded to the unit's step, or null if it isn't a valid amount (or needs more decimals). */
export function normalizeQty(qty: number, unit: SaleUnit): number | null {
  const f = 10 ** QTY_DECIMALS[unit];
  const n = Math.round(qty * f) / f;
  return Number.isFinite(qty) && n > 0 && n <= MAX_QTY && Math.abs(n - qty) < 1e-9 ? n : null;
}

/** Line total in whole so'm (a kilogram price times 1,5 kg can end in a half). */
export const lineTotal = (price: number, qty: number) => Math.round(price * qty);

/** "1,5 kg", "30 dona", "2 pachka", "1 korobka". The decimal comma is the Uzbek convention. */
export const qtyText = (qty: number, unit: SaleUnit) => `${String(qty).replace('.', ',')} ${UNIT_LABEL[unit]}`;

/** What a price is per: "dona", "kg", or "10 talik pachka" / "30 talik korobka" when the pack size is known. */
export const perText = (unit: SaleUnit, packSize?: number) => (isPackUnit(unit) && packSize ? `${packSize} talik ${UNIT_LABEL[unit]}` : UNIT_LABEL[unit]);
