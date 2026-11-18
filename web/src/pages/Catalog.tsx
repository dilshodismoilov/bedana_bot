import { Link, useLocation } from 'wouter-preact';
import type { Me, Product } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { cart, cartLines, linesTotal, saleOptions, setQty } from '../cart.ts';
import { money } from '../format.ts';
import { Icon, MainButton, QtyInput, Status, UnitPrice } from '../ui.tsx';

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
      ) : products.data.length === 0 ? (
        <Status>
          <div class="empty">
            <Icon name="box" />
            <div class="empty-title">Hozircha mahsulot yo'q</div>
            <div>Tez orada qo'shiladi</div>
          </div>
        </Status>
      ) : (
        <div class="grid">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {products.data?.length === 0 && me.data?.isAdmin && (
        <MainButton text="Yangi mahsulot" onClick={() => navigate('/admin/products/new')} />
      )}
      {lines.length > 0 && <MainButton text={`Savat · ${money(linesTotal(lines))}`} onClick={() => navigate('/cart')} />}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div class="card product">
      <Link href={`/products/${product.id}`} class="product-link">
        <img src={product.images[0]} alt="" loading="lazy" />
        <div class="product-name">{product.name}</div>
      </Link>
      {saleOptions(product).map((o) => (
        <div class="product-option" key={o.key}>
          <div class="product-price">
            <UnitPrice value={o.price} unit={o.unit} packSize={product.pack?.size} />
          </div>
          <QtyInput qty={cart.value[o.key] ?? 0} unit={o.unit} onChange={(n) => setQty(o.key, n)} />
        </div>
      ))}
    </div>
  );
}
