import { Link, useLocation } from 'wouter-preact';
import type { Order, Product } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { BackButton, Icon, MainButton, Status, UnitPrice } from '../ui.tsx';
import { OrderRow } from './OrderRow.tsx';

function AdminTabs() {
  const [location] = useLocation();
  return (
    <nav class="segmented">
      <Link href="/admin" class={location === '/admin' ? 'active' : ''}>
        Buyurtmalar
      </Link>
      <Link href="/admin/products" class={location === '/admin/products' ? 'active' : ''}>
        Mahsulotlar
      </Link>
    </nav>
  );
}

/** Open orders first (unpaid or not completed), then recently closed ones, dimmed. */
export function AdminOrders() {
  const orders = useApi<Order[]>('/admin/orders');
  return (
    <div class="page">
      <BackButton to="/" />
      <AdminTabs />
      {!orders.data ? (
        <Status error={orders.error} />
      ) : orders.data.length === 0 ? (
        <Status>Buyurtmalar yo'q</Status>
      ) : (
        <section class="card list">
          {orders.data.map((o) => (
            <OrderRow key={o.id} order={o} showName />
          ))}
        </section>
      )}
    </div>
  );
}

export function AdminProducts() {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  return (
    <div class="page">
      <BackButton to="/" />
      <AdminTabs />
      {!products.data ? (
        <Status error={products.error} />
      ) : (
        products.data.length > 0 && (
          <section class="card list">
            {products.data.map((p) => (
              <Link key={p.id} href={`/admin/products/${p.id}`} class="row">
                <img class="thumb" src={p.image} alt="" />
                <div class="row-main">
                  <div>{p.name}</div>
                  <div class="muted">
                    <UnitPrice value={p.price} />
                  </div>
                </div>
                <Icon name="chevron" />
              </Link>
            ))}
          </section>
        )
      )}
      <MainButton text="Yangi mahsulot" onClick={() => navigate('/admin/products/new')} />
    </div>
  );
}
