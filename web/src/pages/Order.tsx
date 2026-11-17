import { useState } from 'preact/hooks';
import type { Me, Order, OrderStatus } from '../../../shared/types.ts';
import { api, useApi } from '../api.ts';
import { dateTime, money } from '../format.ts';
import { LocationPreview } from '../map.tsx';
import { alert, haptic } from '../tg.ts';
import { BackButton, StatusBadges, Status } from '../ui.tsx';

// Switches work the same in both directions with no confirmation: a mistaken tap is undone by tapping again.
const STATUS_LABEL: Record<OrderStatus, string> = { paid: "To'langan", completed: 'Bajarilgan' };

/** Order details. Customers see their own orders; admins (e.g. opened from the group message) switch its statuses. */
export function OrderPage({ id }: { id: number }) {
  const order = useApi<Order>(`/orders/${id}`);
  const me = useApi<Me>('/me');
  const [saving, setSaving] = useState<OrderStatus | null>(null);
  const isAdmin = !!me.data?.isAdmin;

  async function setStatus(status: OrderStatus, on: boolean) {
    setSaving(status);
    try {
      order.mutate(await api<Order>(`/orders/${id}/${status}`, { method: 'PUT', json: { [status]: on } }));
      haptic.success();
    } catch (e) {
      alert((e as Error).message);
    }
    setSaving(null);
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
            <StatusBadges order={o} />
          </section>

          {isAdmin && (
            <section class="card list">
              {(['paid', 'completed'] as const).map((status) => {
                const at = status === 'paid' ? o.paidAt : o.completedAt;
                return (
                  <label class="row switch-row" key={status}>
                    <div class="row-main">
                      <div>{STATUS_LABEL[status]}</div>
                      {at && <div class="muted">{dateTime(at)}</div>}
                    </div>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={STATUS_LABEL[status]}
                      class="switch"
                      checked={!!at}
                      disabled={saving !== null}
                      onClick={(e) => {
                        e.preventDefault(); // the server's answer sets the state, not the click
                        setStatus(status, !at);
                      }}
                    />
                  </label>
                );
              })}
            </section>
          )}

          <section class="card list">
            {o.items.map((i, n) => (
              <div class="row" key={n}>
                <div class="row-main">
                  <div>{i.name}</div>
                  <div class="muted">
                    {i.qty} dona × {money(i.price)}
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
          </section>

          {o.location && <LocationPreview value={o.location} />}
        </>
      )}
    </div>
  );
}
