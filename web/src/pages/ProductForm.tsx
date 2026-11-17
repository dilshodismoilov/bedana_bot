import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Product } from '../../../shared/types.ts';
import { api, useApi } from '../api.ts';
import { ImageCrop } from '../crop.tsx';
import { alert, confirm, haptic } from '../tg.ts';
import { BackButton, MainButton, Status } from '../ui.tsx';

/** Create (id = null) or edit a product. */
export function ProductForm({ id }: { id: number | null }) {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const existing = id === null ? null : products.data?.find((p) => p.id === id);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [src, setSrc] = useState<string>();
  const [imageEdited, setImageEdited] = useState(false); // new photo picked, or the current one moved/zoomed
  const crop = useRef<(() => Promise<Blob>) | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setPrice(String(existing.price));
    setSrc(existing.image);
  }, [existing?.id]);

  function pick(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again still fires change
    if (!file) return;
    if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(file));
    setImageEdited(true);
    markValid('image');
  }

  const markValid = (key: string) => setInvalid((s) => new Set([...s].filter((k) => k !== key)));

  async function save() {
    const bad = new Set<string>();
    if (!src) bad.add('image');
    if (!name.trim()) bad.add('name');
    if (!(Number(price) > 0)) bad.add('price');
    if (bad.size) {
      haptic.error();
      setInvalid(bad);
      return;
    }

    const form = new FormData();
    form.set('name', name.trim());
    form.set('price', price);

    setSaving(true);
    try {
      if (imageEdited) form.set('image', await crop.current!(), 'image.jpg');
      const saved = await api<Product>(id === null ? '/products' : `/products/${id}`, { method: id === null ? 'POST' : 'PUT', form });
      // Show the saved product right away; the list refetches in the background.
      const list = products.data ?? [];
      products.mutate(id === null ? [...list, saved] : list.map((p) => (p.id === id ? saved : p)));
      haptic.success();
      navigate('/admin/products', { replace: true });
    } catch (e) {
      alert((e as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm(`"${name}" o'chirilsinmi?`))) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      navigate('/admin/products', { replace: true });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (id !== null && !existing) return <Status error={products.error ?? (products.data ? 'Mahsulot topilmadi' : undefined)} />;

  return (
    <div class="page">
      <BackButton to="/admin/products" />

      <ImageCrop
        src={src}
        invalid={invalid.has('image')}
        cropRef={crop}
        onPick={() => fileInput.current?.click()}
        onEdit={() => setImageEdited(true)}
        onError={() => {
          setSrc(undefined);
          alert("Rasmni ochib bo'lmadi. Boshqa rasm tanlang");
        }}
      />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pick(e.currentTarget)} />

      <section class="card fields">
        <input
          class={invalid.has('name') ? 'invalid' : ''}
          placeholder="Nomi"
          value={name}
          onInput={(e) => {
            setName(e.currentTarget.value);
            markValid('name');
          }}
        />
        <label class={`suffix-field ${invalid.has('price') ? 'invalid' : ''}`}>
          <input
            placeholder="Narxi"
            inputMode="numeric"
            value={price}
            onInput={(e) => {
              setPrice(e.currentTarget.value.replace(/\D/g, ''));
              markValid('price');
            }}
          />
          <span class="muted">so'm / dona</span>
        </label>
      </section>

      {id !== null && (
        <button class="text-button danger" onClick={remove}>
          O'chirish
        </button>
      )}

      <MainButton text="Saqlash" onClick={save} loading={saving} />
    </div>
  );
}
