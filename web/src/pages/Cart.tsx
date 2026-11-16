import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Contact, Me, Order, Product } from '../../../shared/types.ts';
import { api, prime, useApi } from '../api.ts';
import { cartLines, clearCart, draft, linesTotal, setQty } from '../cart.ts';
import { money } from '../format.ts';
import { alert, haptic, tg } from '../tg.ts';
import { BackButton, MainButton, Status, Stepper } from '../ui.tsx';

const isValid: Record<keyof Contact, (v: string) => boolean> = {
  name: (v) => v.trim().length > 0,
  phone: (v) => v.replace(/\D/g, '').length >= 9,
  address: (v) => v.trim().length > 0,
};

export function Cart() {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const me = useApi<Me>('/me');
  const [invalid, setInvalid] = useState<Partial<Record<keyof Contact, boolean>>>({});
  const [sending, setSending] = useState(false);

  const lines = cartLines(products.data ?? []);
  const total = linesTotal(lines);
  const form = draft.value;

  // Prefill from the last order, or from the Telegram profile on the first order.
  useEffect(() => {
    if (!me.data || form.name || form.phone || form.address) return;
    const u = tg.initDataUnsafe.user;
    draft.value = me.data.contact ?? { name: [u?.first_name, u?.last_name].filter(Boolean).join(' '), phone: '', address: '' };
  }, [me.data]);

  // Emptied the cart from here: nothing left to check out.
  useEffect(() => {
    if (products.data && lines.length === 0 && !sending) navigate('/');
  }, [products.data, lines.length]);

  const set = (key: keyof Contact) => (e: Event) => {
    draft.value = { ...draft.value, [key]: (e.currentTarget as HTMLInputElement).value };
    setInvalid((s) => ({ ...s, [key]: false }));
  };

  async function submit() {
    const bad = (Object.keys(isValid) as (keyof Contact)[]).filter((k) => !isValid[k](form[k]));
    if (bad.length) {
      haptic.error();
      setInvalid(Object.fromEntries(bad.map((k) => [k, true])));
      document.querySelector<HTMLElement>(`[name=${bad[0]}]`)?.focus();
      return;
    }
    setSending(true);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        json: { ...form, items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })) },
      });
      haptic.success();
      prime(`/orders/${order.id}`, order);
      clearCart();
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (e) {
      haptic.error();
      alert((e as Error).message);
      products.reload();
      setSending(false);
    }
  }

  if (!products.data) return <Status error={products.error} />;

  return (
    <div class="page">
      <BackButton to="/" />

      <section class="card list">
        {lines.map(({ product, qty }) => (
          <div class="row" key={product.id}>
            <img class="thumb" src={product.image} alt="" />
            <div class="row-main">
              <div>{product.name}</div>
              <div class="muted">{money(product.price * qty)}</div>
            </div>
            <Stepper qty={qty} onChange={(n) => setQty(product.id, n)} />
          </div>
        ))}
      </section>

      <section class="card fields">
        <input name="name" class={invalid.name ? 'invalid' : ''} placeholder="Ism" autocomplete="name" value={form.name} onInput={set('name')} />
        <input
          name="phone"
          class={invalid.phone ? 'invalid' : ''}
          placeholder="Telefon"
          type="tel"
          autocomplete="tel"
          value={form.phone}
          onInput={set('phone')}
          onFocus={() => !form.phone && (draft.value = { ...form, phone: '+998 ' })}
        />
        <textarea name="address" class={invalid.address ? 'invalid' : ''} placeholder="Manzil" rows={2} value={form.address} onInput={set('address')} />
      </section>

      <MainButton text={`Buyurtma berish · ${money(total)}`} onClick={submit} loading={sending} />
    </div>
  );
}
