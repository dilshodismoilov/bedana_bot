import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { FULFILLMENTS, isOffered, OFFERED_FULFILLMENTS, pickupBranch } from '../../../shared/delivery.ts';
import type { Contact, Me, Order, Product } from '../../../shared/types.ts';
import { api, prime, useApi } from '../api.ts';
import { cartLines, clearCart, draft, linesTotal, setQty } from '../cart.ts';
import { lineTotal } from '../../../shared/units.ts';
import { money } from '../format.ts';
import { LocationPicker, LocationPreview } from '../map.tsx';
import { alert, allowBotMessages, haptic, tg } from '../tg.ts';
import { BackButton, MainButton, QtyInput, Status, UnitPrice } from '../ui.tsx';

/** Checkout fields that are missing or wrong, in screen order. */
function invalidFields(c: Contact): (keyof Contact)[] {
  const bad: (keyof Contact)[] = [];
  if (!c.name.trim()) bad.push('name');
  if (c.phone.replace(/\D/g, '').length < 9) bad.push('phone');
  if (!isOffered(c.fulfillment)) bad.push('fulfillment'); // a hidden option kept from a draft or the last order counts as not chosen
  else if (!pickupBranch(c.fulfillment) && !c.location) bad.push('location');
  return bad;
}

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
    if (!me.data || form.name || form.phone || form.fulfillment || form.location) return;
    const u = tg.initDataUnsafe.user;
    draft.value = me.data.contact ?? { name: [u?.first_name, u?.last_name].filter(Boolean).join(' '), phone: '', fulfillment: null, location: null };
  }, [me.data]);

  // Emptied the cart from here: nothing left to check out.
  useEffect(() => {
    if (products.data && lines.length === 0 && !sending) navigate('/');
  }, [products.data, lines.length]);

  const update = <K extends keyof Contact>(key: K, value: Contact[K]) => {
    draft.value = { ...draft.value, [key]: value };
    setInvalid((s) => ({ ...s, [key]: false }));
  };
  const set = (key: 'name' | 'phone') => (e: Event) => update(key, (e.currentTarget as HTMLInputElement).value);

  async function submit() {
    const bad = invalidFields(form);
    if (bad.length) {
      haptic.error();
      setInvalid(Object.fromEntries(bad.map((k) => [k, true])));
      if (bad[0] === 'fulfillment' || bad[0] === 'location') document.getElementById(bad[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else document.querySelector<HTMLElement>(`[name=${bad[0]}]`)?.focus();
      return;
    }
    setSending(true);
    await allowBotMessages(); // so the bot can send the order confirmation to the customer's chat
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        json: { ...form, items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, pack: l.pack })) },
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

  const chosen = isOffered(form.fulfillment) ? form.fulfillment : null;
  const option = chosen && FULFILLMENTS[chosen];
  const branch = chosen && pickupBranch(chosen);

  return (
    <div class="page">
      <BackButton to="/" />

      <section class="card list">
        {lines.map((l) => (
          <div class="row" key={l.key}>
            <img class="thumb" src={l.product.images[0]} alt="" />
            <div class="row-main">
              <div>{l.product.name}</div>
              <div class="muted">
                <UnitPrice value={l.price} unit={l.unit} packSize={l.product.pack?.size} />
              </div>
            </div>
            <div class="row-end">
              <QtyInput qty={l.qty} unit={l.unit} onChange={(n) => setQty(l.key, n)} />
              <div>{money(lineTotal(l.price, l.qty))}</div>
            </div>
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
      </section>

      <section class={`card list choices ${invalid.fulfillment ? 'invalid' : ''}`} id="fulfillment" role="radiogroup">
        {OFFERED_FULFILLMENTS.map((f) => (
          <label class="row choice" key={f}>
            <span class="choice-icon">{FULFILLMENTS[f].icon}</span>
            <div class="row-main">
              <div>{FULFILLMENTS[f].title}</div>
              {FULFILLMENTS[f].note && <div class="muted">{FULFILLMENTS[f].note}</div>}
            </div>
            <input
              type="radio"
              class="radio"
              name="fulfillment"
              checked={form.fulfillment === f}
              onChange={() => {
                update('fulfillment', f);
                haptic.tap();
              }}
            />
          </label>
        ))}
      </section>

      {branch ? (
        <LocationPreview value={branch.location} />
      ) : (
        option && (
          <LocationPicker value={form.location} center={option.center} onChange={(p) => update('location', p)} invalid={invalid.location} />
        )
      )}

      <MainButton text={`Buyurtma berish · ${money(total)}`} onClick={submit} loading={sending} />
    </div>
  );
}
