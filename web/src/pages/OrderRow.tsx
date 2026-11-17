import { Link } from 'wouter-preact';
import type { Order } from '../../../shared/types.ts';
import { dateTime, money } from '../format.ts';
import { StatusBadges } from '../ui.tsx';

export function OrderRow({ order, showName = false }: { order: Order; showName?: boolean }) {
  const closed = !!(order.paidAt && order.completedAt); // nothing left to do
  return (
    <Link href={`/orders/${order.id}`} class={`row ${closed ? 'closed' : ''}`}>
      <div class="row-main">
        <div>
          #{order.id}
          {showName && ` · ${order.name}`}
        </div>
        <div class="muted">{dateTime(order.createdAt)}</div>
      </div>
      <div class="row-end">
        <div>{money(order.total)}</div>
        <StatusBadges order={order} />
      </div>
    </Link>
  );
}
