import { Link, useLocation } from 'wouter-preact';
import type { Me, Product } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { cart, cartLines, linesTotal, setQty } from '../cart.ts';
import { money } from '../format.ts';
import { haptic } from '../tg.ts';
import { Icon, MainButton, Status, Stepper } from '../ui.tsx';

export function Catalog() {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const me = useApi<Me>('/me');

  const lines = cartLines(products.data ?? []);

  return (
    <div class="page">
      {(me.data?.ordersCount || me.data?.isAdmin) && (
        <header class="toolbar">
          {!!me.data.ordersCount && (
            <Link href="/orders" class="icon-button" aria-label="Buyurtmalarim">
              <Icon name="receipt" />
            </Link>
          )}
          {me.data.isAdmin && (
            <Link href="/admin" class="icon-button" aria-label="Boshqaruv">
              <Icon name="settings" />
            </Link>
          )}
        </header>
      )}

      {!products.data ? (
        <Status error={products.error} />
      ) : (
        <div class="grid">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} qty={cart.value[p.id] ?? 0} />
          ))}
        </div>
      )}

      {lines.length > 0 && <MainButton text={`Savat · ${money(linesTotal(lines))}`} onClick={() => navigate('/cart')} />}
    </div>
  );
}

function ProductCard({ product, qty }: { product: Product; qty: number }) {
  return (
    <div class="card product">
      <img src={product.image} alt="" loading="lazy" />
      <div class="product-name">{product.name}</div>
      <div class="product-price">{money(product.price)}</div>
      {qty > 0 ? (
        <Stepper qty={qty} onChange={(n) => setQty(product.id, n)} />
      ) : (
        <button
          class="add-button"
          aria-label="Savatga qo'shish"
          onClick={() => {
            haptic.tap();
            setQty(product.id, 1);
          }}
        >
          <Icon name="plus" />
        </button>
      )}
    </div>
  );
}
