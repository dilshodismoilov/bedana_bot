import { useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Product } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { cart, cartLines, linesTotal, setQty } from '../cart.ts';
import { money } from '../format.ts';
import { BackButton, MainButton, QtyInput, Status, UnitPrice } from '../ui.tsx';

/** One product: photo gallery, description, quantity. Opened from a catalog card. */
export function ProductPage({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const product = products.data?.find((p) => p.id === id);
  const lines = cartLines(products.data ?? []);

  return (
    <div class="page">
      <BackButton to="/" />
      {!product ? (
        <Status error={products.error ?? (products.data ? 'Mahsulot topilmadi' : undefined)} />
      ) : (
        <>
          <Gallery key={product.id} images={product.images} />
          <section class="card product-info">
            <h1>{product.name}</h1>
            <div class="product-buy">
              <UnitPrice value={product.price} />
              <QtyInput qty={cart.value[product.id] ?? 0} onChange={(n) => setQty(product.id, n)} />
            </div>
            {product.description && <p class="product-description">{product.description}</p>}
          </section>
        </>
      )}
      {lines.length > 0 && <MainButton text={`Savat · ${money(linesTotal(lines))}`} onClick={() => navigate('/cart')} />}
    </div>
  );
}

/** Swipeable square photos with dots; tapping a dot scrolls to that photo (for a mouse). */
function Gallery({ images }: { images: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  return (
    <div class="card gallery">
      <div class="gallery-track" ref={track} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {images.map((src) => (
          <img key={src} src={src} alt="" />
        ))}
      </div>
      {images.length > 1 && (
        <div class="gallery-dots">
          {images.map((src, i) => (
            <button
              key={src}
              class={i === index ? 'active' : ''}
              aria-label={`${i + 1}-rasm`}
              onClick={() => track.current!.scrollTo({ left: i * track.current!.clientWidth, behavior: 'smooth' })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
