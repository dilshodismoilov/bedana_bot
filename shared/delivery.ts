// How an order reaches the customer: picked up at a branch, or delivered. Shop contacts live here too.
import type { LatLng } from './types.ts';

export const SHOP_PHONE = '+998 93 976 15 45';

export type BranchId = 'fergana' | 'tashkent';

export const BRANCHES: Record<BranchId, { name: string; location: LatLng }> = {
  fergana: { name: "Farg'ona", location: { lat: 40.424093, lng: 71.765691 } },
  tashkent: { name: 'Toshkent', location: { lat: 41.352927, lng: 69.218404 } },
};

export type Fulfillment = 'pickup_fergana' | 'pickup_tashkent' | 'delivery_valley' | 'delivery_tashkent' | 'other';

type Option = {
  icon: string;
  title: string;
  note?: string; // shown after the title, dimmed in the app and in brackets in messages
  branch?: BranchId; // pickup: no customer location needed
  center?: LatLng; // where the delivery map starts before the customer picks a point
  hidden?: true; // not offered for new orders yet; past orders with it still show it
};

/** In the order the customer sees them. Stored in orders.fulfillment by id, so never rename an id. */
export const FULFILLMENTS: Record<Fulfillment, Option> = {
  pickup_fergana: { icon: '🏠', title: "O'zim olib ketaman — Farg'ona", branch: 'fergana' },
  pickup_tashkent: { icon: '🏠', title: "O'zim olib ketaman — Toshkent", branch: 'tashkent', hidden: true },
  delivery_valley: {
    icon: '🚚',
    title: "Yetkazib berish — Farg'ona vodiysi",
    note: "Farg'ona/Andijon/Namangan",
    center: BRANCHES.fergana.location,
  },
  delivery_tashkent: { icon: '🚚', title: 'Yetkazib berish — Toshkent shahri/viloyati', center: BRANCHES.tashkent.location },
  other: { icon: '❓', title: 'Boshqa hudud / kelishamiz' },
};

export const FULFILLMENT_IDS = Object.keys(FULFILLMENTS) as Fulfillment[];

/** The options a new order can choose from: all but the hidden ones. */
export const OFFERED_FULFILLMENTS = FULFILLMENT_IDS.filter((f) => !FULFILLMENTS[f].hidden);

export const isOffered = (f: unknown): f is Fulfillment => OFFERED_FULFILLMENTS.includes(f as Fulfillment);

/** The branch to pick the order up at, or null when it is delivered (the customer then gives their location). */
export const pickupBranch = (f: Fulfillment) => {
  const id = FULFILLMENTS[f].branch;
  return id ? BRANCHES[id] : null;
};

/** One line, e.g. "🚚 Yetkazib berish — Farg'ona vodiysi (Farg'ona/Andijon/Namangan)". */
export const fulfillmentText = (f: Fulfillment) => {
  const o = FULFILLMENTS[f];
  return `${o.icon} ${o.title}${o.note ? ` (${o.note})` : ''}`;
};

export const yandexMapUrl = ({ lat, lng }: LatLng) => `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`;
