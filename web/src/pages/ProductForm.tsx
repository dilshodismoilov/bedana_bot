import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Product } from '../../../shared/types.ts';
import { api, useApi } from '../api.ts';
import { alert, confirm, haptic } from '../tg.ts';
import { BackButton, Icon, MainButton, Status } from '../ui.tsx';

/** Create (id = null) or edit a product. */
export function ProductForm({ id }: { id: number | null }) {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const existing = id === null ? null : products.data?.find((p) => p.id === id);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>();
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setPrice(String(existing.price));
    setPreview(existing.image);
  }, [existing?.id]);

  async function pick(file: File | undefined) {
    if (!file) return;
    const resized = await resizeImage(file);
    setImage(resized);
    setPreview(URL.createObjectURL(resized));
    markValid('image');
  }

  const markValid = (key: string) => setInvalid((s) => new Set([...s].filter((k) => k !== key)));

  async function save() {
    const bad = new Set<string>();
    if (!preview) bad.add('image');
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
    if (image) form.set('image', image, 'image.jpg');

    setSaving(true);
    try {
      await api(id === null ? '/products' : `/products/${id}`, { method: id === null ? 'POST' : 'PUT', form });
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

      <button class={`image-picker ${invalid.has('image') ? 'invalid' : ''}`} onClick={() => fileInput.current?.click()}>
        {preview ? <img src={preview} alt="" /> : <Icon name="image" />}
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />

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

/** Phone photos are several MB; shrink to 1200px JPEG before upload so the catalog loads fast. */
async function resizeImage(file: File, max = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasm xatosi'))), 'image/jpeg', 0.85));
}
