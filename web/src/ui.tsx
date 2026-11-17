// Shared UI pieces. MainButton/BackButton drive Telegram's native controls inside Telegram
// and render HTML fallbacks in a regular browser, so pages never branch on the environment.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Order } from '../../shared/types.ts';
import { money } from './format.ts';
import { inTelegram, tg } from './tg.ts';

type MainButtonProps = { text: string; onClick: () => void; loading?: boolean; disabled?: boolean };

export function MainButton(props: MainButtonProps) {
  return inTelegram ? <NativeMainButton {...props} /> : <FallbackMainButton {...props} />;
}

function NativeMainButton({ text, onClick, loading = false, disabled = false }: MainButtonProps) {
  const handler = useRef(onClick);
  handler.current = onClick;

  useEffect(() => {
    const fire = () => handler.current();
    tg.MainButton.onClick(fire);
    return () => {
      tg.MainButton.offClick(fire);
      tg.MainButton.hide();
    };
  }, []);

  // Layout effect: runs right after the render. A plain useEffect waits for the next frame, and inside
  // Telegram (keyboard open) that could be postponed until the next render, so the button lagged one step
  // behind the typed quantity.
  useLayoutEffect(() => {
    tg.MainButton.setParams({ text, is_visible: true, is_active: !disabled && !loading });
    if (loading) tg.MainButton.showProgress(false);
    else tg.MainButton.hideProgress();
  }, [text, loading, disabled]);

  return null;
}

function FallbackMainButton({ text, onClick, loading, disabled }: MainButtonProps) {
  return (
    <div class="main-button-bar">
      <button class="main-button" onClick={onClick} disabled={disabled || loading}>
        {loading ? <span class="spinner" /> : text}
      </button>
    </div>
  );
}

/** Telegram back button that goes to a fixed parent screen, so deep links always have a sensible way back. */
export function BackButton({ to }: { to: string }) {
  const [, navigate] = useLocation();
  const target = useRef(to);
  target.current = to;

  useEffect(() => {
    if (!inTelegram) return;
    const back = () => navigate(target.current);
    tg.BackButton.onClick(back);
    tg.BackButton.show();
    return () => {
      tg.BackButton.offClick(back);
      tg.BackButton.hide();
    };
  }, []);

  if (inTelegram) return null;
  return (
    <button class="icon-button back-fallback" onClick={() => navigate(to)} aria-label="Orqaga">
      <Icon name="back" />
    </button>
  );
}

const MAX_QTY = 100_000; // same limit as the server

/**
 * Quantity field: the cart follows the number as it is typed, no button to press.
 * An emptied field removes the item when the field loses focus, so a cart row doesn't vanish
 * while a new number is being typed.
 */
export function QtyInput({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const [value, setValue] = useState(qty ? String(qty) : '');
  const focused = useRef(false);

  // Follow cart changes made elsewhere (e.g. the same product's field on another screen), but not mid-typing.
  useEffect(() => {
    if (!focused.current) setValue(qty ? String(qty) : '');
  }, [qty]);

  return (
    <form
      class={`qty ${qty ? 'in-cart' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        (e.currentTarget.elements[0] as HTMLInputElement).blur(); // Enter closes the keyboard
      }}
    >
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        placeholder="0"
        aria-label="Miqdor"
        value={value}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (!Number(value)) {
            setValue('');
            onChange(0);
          }
        }}
        onInput={(e) => {
          const digits = e.currentTarget.value.replace(/D/g, '').replace(/^0+(?=d)/, '');
          const next = digits && String(Math.min(Number(digits), MAX_QTY));
          e.currentTarget.value = next; // keep the field in sync even when the state value doesn't change
          setValue(next);
          if (Number(next) > 0) onChange(Number(next));
        }}
      />
      <span>dona</span>
    </form>
  );
}

/** Price of one piece, e.g. "1 600 so'm / dona". The unit is dimmed so the number stays prominent. */
export function UnitPrice({ value }: { value: number }) {
  return (
    <span class="unit-price">
      {money(value)}
      <span class="unit"> / dona</span>
    </span>
  );
}

/** Payment status always; completion only once done (not completed is the normal state, so it adds no badge). */
export function StatusBadges({ order }: { order: Pick<Order, 'paidAt' | 'completedAt'> }) {
  return (
    <span class="badges">
      <span class={`badge ${order.paidAt ? 'badge-paid' : 'badge-unpaid'}`}>{order.paidAt ? "To'langan" : "To'lanmagan"}</span>
      {order.completedAt && <span class="badge badge-completed">Bajarildi</span>}
    </span>
  );
}

/** Loading/error/empty states for a page body. */
export function Status({ error, children }: { error?: string; children?: ComponentChildren }) {
  if (error) return <div class="status">{error}</div>;
  if (children) return <div class="status">{children}</div>;
  return (
    <div class="status">
      <span class="spinner" />
    </div>
  );
}

const paths = {
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5L12 12l9-4.5M12 12v9',
  back: 'M15 18l-6-6 6-6',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  chevron: 'M9 6l6 6-6 6',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10',
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
