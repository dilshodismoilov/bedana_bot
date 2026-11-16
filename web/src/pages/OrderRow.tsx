import { Link } from 'wouter-preact';
import type { Order } from '../../../shared/types.ts';
import { dateTime, money } from '../format.ts';
import { PaidBadge } from '../ui.tsx';

export function OrderRow({ order, showName = false }: { order: Order; showName?: boolean }) {
  return (
    <Link href={`/orders/${order.id}`} class="row">
      <div class="row-main">
        <div>
          #{order.id}
          {showName && ` · ${order.name}`}
        </div>
        <div class="muted">{dateTime(order.createdAt)}</div>
      </div>
      <div class="row-end">
        <div>{money(order.total)}</div>
        <PaidBadge paid={!!order.paidAt} />
      </div>
    </Link>
  );
}
