import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import type { Product } from '../../../shared/types.ts';
import { api, useApi } from '../api.ts';
import { centerSquare, ImageCrop } from '../crop.tsx';
import { alert, confirm, haptic } from '../tg.ts';
import { BackButton, Icon, MainButton, Status } from '../ui.tsx';

const MAX_PHOTOS = 10; // same limit as the server

/**
 * A photo in the form. `src` is what is shown: the product's URL, a picked file, or the cropped result.
 * `edited`: picked or moved/zoomed since it was last cropped; cropping turns it into `upload`.
 */
type Photo = { src: string; upload: Blob | null; edited: boolean };

/** Create (id = null) or edit a product. The first photo is the cover in the catalog. */
export function ProductForm({ id }: { id: number | null }) {
  const [, navigate] = useLocation();
  const products = useApi<Product[]>('/products');
  const existing = id === null ? null : products.data?.find((p) => p.id === id);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState(0);
  const crop = useRef<(() => Promise<Blob>) | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setPrice(String(existing.price));
    setDescription(existing.description);
    setPhotos(existing.images.map((src) => ({ src, upload: null, edited: false })));
  }, [existing?.id]);

  const markValid = (key: string) => setInvalid((s) => new Set([...s].filter((k) => k !== key)));

  /** Crops photo `i` if it changed: the selected one as framed, any other one centered. */
  async function cropPhoto(list: Photo[], i: number): Promise<Photo[]> {
    const p = list[i];
    if (!p?.edited) return list;
    const blob = i === selected && crop.current ? await crop.current() : await centerSquare(p.src);
    if (p.src.startsWith('blob:')) URL.revokeObjectURL(p.src);
    return list.map((q, j) => (j === i ? { src: URL.createObjectURL(blob), upload: blob, edited: false } : q));
  }

  /** Only the selected photo has a frame, so its crop is applied before another one takes its place. */
  async function select(i: number, list = photos) {
    try {
      const next = await cropPhoto(list, selected);
      setPhotos(next);
      setSelected(i);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function pick(input: HTMLInputElement) {
    const files = [...(input.files ?? [])].slice(0, MAX_PHOTOS - photos.length);
    input.value = ''; // picking the same file again still fires change
    if (!files.length) return;
    const added = files.map((f) => ({ src: URL.createObjectURL(f), upload: null, edited: true }));
    markValid('image');
    if (!photos.length) {
      setPhotos(added);
      setSelected(0);
    } else select(photos.length, [...photos, ...added]);
  }

  function edit() {
    setPhotos((list) => (list[selected].edited ? list : list.map((p, j) => (j === selected ? { ...p, edited: true } : p))));
  }

  function remove() {
    const p = photos[selected];
    if (p.src.startsWith('blob:')) URL.revokeObjectURL(p.src);
    setPhotos(photos.filter((_, j) => j !== selected));
    setSelected(Math.max(0, Math.min(selected, photos.length - 2)));
  }

  /** Moves the selected photo one place left (-1) or right (+1). */
  function move(step: -1 | 1) {
    const to = selected + step;
    const next = [...photos];
    [next[selected], next[to]] = [next[to], next[selected]];
    setPhotos(next);
    setSelected(to);
    haptic.tap();
  }

  async function save() {
    const bad = new Set<string>();
    if (!photos.length) bad.add('image');
    if (!name.trim()) bad.add('name');
    if (!(Number(price) > 0)) bad.add('price');
    if (bad.size) {
      haptic.error();
      setInvalid(bad);
      return;
    }

    setSaving(true);
    try {
      let list = photos;
      for (let i = 0; i < list.length; i++) list = await cropPhoto(list, i);
      setPhotos(list); // a retry after an error doesn't crop again

      const form = new FormData();
      form.set('name', name.trim());
      form.set('price', price);
      form.set('description', description.trim());
      for (const p of list) form.append('images', p.upload ? new File([p.upload], 'image.jpg', { type: 'image/jpeg' }) : p.src);

      const saved = await api<Product>(id === null ? '/products' : `/products/${id}`, { method: id === null ? 'POST' : 'PUT', form });
      // Show the saved product right away; the list refetches in the background.
      const all = products.data ?? [];
      products.mutate(id === null ? [...all, saved] : all.map((p) => (p.id === id ? saved : p)));
      haptic.success();
      navigate('/admin/products', { replace: true });
    } catch (e) {
      alert((e as Error).message);
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!(await confirm(`"${name}" o'chirilsinmi?`))) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      navigate('/admin/products', { replace: true });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (id !== null && !existing) return <Status error={products.error ?? (products.data ? 'Mahsulot topilmadi' : undefined)} />;

  const current = photos[selected];

  return (
    <div class="page">
      <BackButton to="/admin/products" />

      <ImageCrop
        src={current?.src}
        invalid={invalid.has('image')}
        cropRef={crop}
        onPick={() => fileInput.current?.click()}
        onEdit={edit}
        onError={() => {
          remove();
          alert("Rasmni ochib bo'lmadi. Boshqa rasm tanlang");
        }}
      >
        <button class="icon-button photo-action photo-remove" onClick={remove} aria-label="Rasmni olib tashlash">
          <Icon name="trash" />
        </button>
        {selected > 0 && (
          <button class="icon-button photo-action photo-left" onClick={() => move(-1)} aria-label="Chapga">
            <Icon name="back" />
          </button>
        )}
        {selected < photos.length - 1 && (
          <button class="icon-button photo-action photo-right" onClick={() => move(1)} aria-label="O'ngga">
            <Icon name="chevron" />
          </button>
        )}
      </ImageCrop>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.currentTarget)} />

      {photos.length > 0 && (
        <div class="photo-strip">
          {photos.map((p, i) => (
            <button key={p.src} class={`photo-thumb ${i === selected ? 'selected' : ''}`} onClick={() => i !== selected && select(i)}>
              <img src={p.src} alt="" />
            </button>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button class="photo-thumb photo-add" onClick={() => fileInput.current?.click()} aria-label="Rasm qo'shish">
              <Icon name="plus" />
            </button>
          )}
        </div>
      )}

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
        <AutoTextarea placeholder="Tavsif" maxLength={2000} value={description} onInput={setDescription} />
      </section>

      {id !== null && (
        <button class="text-button danger" onClick={deleteProduct}>
          O'chirish
        </button>
      )}

      <MainButton text="Saqlash" onClick={save} loading={saving} />
    </div>
  );
}

/** A textarea that grows with its text instead of scrolling inside. */
function AutoTextarea(props: { placeholder: string; maxLength: number; value: string; onInput: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={3}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      value={props.value}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}
