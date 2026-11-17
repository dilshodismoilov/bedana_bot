// Shared UI pieces. MainButton/BackButton drive Telegram's native controls inside Telegram
// and render HTML fallbacks in a regular browser, so pages never branch on the environment.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { haptic, inTelegram, tg } from './tg.ts';

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

  useEffect(() => {
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

export function Stepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const set = (n: number) => {
    haptic.tap();
    onChange(Math.max(0, Math.min(100_000, n)));
  };
  return (
    <div class="stepper">
      <button onClick={() => set(qty - 1)} aria-label="Kamaytirish">
        <Icon name="minus" />
      </button>
      <input
        inputMode="numeric"
        value={qty}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => set(parseInt(e.currentTarget.value, 10) || 0)}
      />
      <button onClick={() => set(qty + 1)} aria-label="Ko'paytirish">
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function PaidBadge({ paid }: { paid: boolean }) {
  return <span class={`badge ${paid ? 'badge-paid' : 'badge-unpaid'}`}>{paid ? "To'langan" : "To'lanmagan"}</span>;
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
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
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
