import type { Order } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { BackButton, Status } from '../ui.tsx';
import { OrderRow } from './OrderRow.tsx';

/** The customer's own orders. */
export function Orders() {
  const orders = useApi<Order[]>('/orders');
  return (
    <div class="page">
      <BackButton to="/" />
      {!orders.data ? (
        <Status error={orders.error} />
      ) : (
        <section class="card list">
          {orders.data.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </section>
      )}
    </div>
  );
}
