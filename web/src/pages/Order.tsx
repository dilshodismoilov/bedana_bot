import { useState } from 'preact/hooks';
import type { Me, Order } from '../../../shared/types.ts';
import { api, useApi } from '../api.ts';
import { dateTime, money } from '../format.ts';
import { alert, confirm, haptic } from '../tg.ts';
import { BackButton, MainButton, PaidBadge, Status } from '../ui.tsx';

/** Order details. Customers see their own orders; admins (opened from the group message) can mark payment. */
export function OrderPage({ id }: { id: number }) {
  const order = useApi<Order>(`/orders/${id}`);
  const me = useApi<Me>('/me');
  const [saving, setSaving] = useState(false);
  const isAdmin = !!me.data?.isAdmin;

  async function setPaid(paid: boolean) {
    if (!paid && !(await confirm("To'lov bekor qilinsinmi?"))) return;
    setSaving(true);
    try {
      order.mutate(await api<Order>(`/orders/${id}/paid`, { method: 'PUT', json: { paid } }));
      haptic.success();
    } catch (e) {
      alert((e as Error).message);
    }
    setSaving(false);
  }

  const o = order.data;
  return (
    <div class="page">
      <BackButton to={isAdmin ? '/admin' : '/orders'} />
      {!o ? (
        <Status error={order.error} />
      ) : (
        <>
          <section class="card order-head">
            <div>
              <h1>#{o.id}</h1>
              <div class="muted">{dateTime(o.createdAt)}</div>
            </div>
            <PaidBadge paid={!!o.paidAt} />
          </section>

          <section class="card list">
            {o.items.map((i, n) => (
              <div class="row" key={n}>
                <div class="row-main">
                  <div>{i.name}</div>
                  <div class="muted">
                    {i.qty} × {money(i.price)}
                  </div>
                </div>
                <div class="row-end">{money(i.price * i.qty)}</div>
              </div>
            ))}
            <div class="row total">
              <div class="row-main" />
              <div class="row-end">{money(o.total)}</div>
            </div>
          </section>

          <section class="card list">
            <div class="row">{o.name}</div>
            <a class="row link" href={`tel:${o.phone.replace(/[^\d+]/g, '')}`}>
              {o.phone}
            </a>
            <div class="row pre">{o.address}</div>
          </section>

          {isAdmin &&
            (o.paidAt ? (
              <button class="text-button" onClick={() => setPaid(false)} disabled={saving}>
                To'lovni bekor qilish
              </button>
            ) : (
              <MainButton text="To'landi" onClick={() => setPaid(true)} loading={saving} />
            ))}
        </>
      )}
    </div>
  );
}
