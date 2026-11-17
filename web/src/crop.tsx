import { useRef, useState } from 'preact/hooks';
import { Icon } from './ui.tsx';

type View = { zoom: number; dx: number; dy: number };
type Size = { w: number; h: number };
type Point = { x: number; y: number };

const MAX_ZOOM = 5;
const OUTPUT = 1200; // px, square; phone photos are several MB, this keeps the catalog fast
const START: View = { zoom: 1, dx: 0, dy: 0 };

type Props = {
  src: string | undefined;
  invalid: boolean;
  onPick: () => void;
  onEdit: () => void;
  onError: () => void;
  cropRef: { current: (() => Promise<Blob>) | null };
};

/**
 * Square product photo, framed exactly as the catalog card shows it. Drag to move, pinch (or mouse wheel) to zoom.
 * `cropRef.current()` renders what is inside the frame to a JPEG.
 */
// Keyed by src: a new photo starts from a fresh frame (a reset effect would race the image's load event).
export const ImageCrop = (props: Props) => <Frame key={props.src} {...props} />;

function Frame({ src, invalid, onPick, onEdit, onError, cropRef }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const [natural, setNatural] = useState<Size | null>(null);
  const [view, setView] = useState(START);
  const [dragging, setDragging] = useState(false);

  const side = () => frame.current?.clientWidth ?? 0;

  /** Pixels on screen per image pixel. */
  const scale = (v: View, n: Size) => (side() / Math.min(n.w, n.h)) * v.zoom;

  /** Keep zoom in range and the frame fully covered by the image. */
  function clamp(v: View, n: Size): View {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const k = scale({ ...v, zoom }, n);
    const maxX = (n.w * k - side()) / 2;
    const maxY = (n.h * k - side()) / 2;
    return { zoom, dx: Math.min(maxX, Math.max(-maxX, v.dx)), dy: Math.min(maxY, Math.max(-maxY, v.dy)) };
  }

  /** Zoom by `factor` keeping the point `at` (relative to the frame center) still, then move by `pan`. */
  function change(factor: number, at: Point, pan: Point) {
    if (!natural) return;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor));
      const f = zoom / v.zoom;
      return clamp({ zoom, dx: at.x - (at.x - v.dx) * f + pan.x, dy: at.y - (at.y - v.dy) * f + pan.y }, natural);
    });
    onEdit();
  }

  const fromCenter = (x: number, y: number): Point => {
    const r = frame.current!.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
  };

  function onPointerMove(e: PointerEvent) {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    const before = [...ps.values()];
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...ps.values()];
    if (after.length === 1) {
      change(1, { x: 0, y: 0 }, { x: e.clientX - prev.x, y: e.clientY - prev.y });
    } else if (after.length === 2) {
      const dist = (p: Point[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = (p: Point[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const [m0, m1] = [mid(before), mid(after)];
      change(dist(after) / dist(before), fromCenter(m0.x, m0.y), { x: m1.x - m0.x, y: m1.y - m0.y });
    }
  }

  function release(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  }

  cropRef.current = async () => {
    const n = natural;
    if (!n || !img.current) throw new Error('Rasm hali yuklanmadi');
    const k = scale(view, n);
    const size = side() / k; // frame side in image pixels
    const sx = (n.w - size) / 2 - view.dx / k;
    const sy = (n.h - size) / 2 - view.dy / k;
    const out = Math.min(OUTPUT, Math.round(size));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = out;
    canvas.getContext('2d')!.drawImage(img.current, sx, sy, size, size, 0, 0, out, out);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasmni saqlab bo\'lmadi'))), 'image/jpeg', 0.85),
    );
  };

  if (!src) {
    return (
      <button class={`image-crop empty ${invalid ? 'invalid' : ''}`} onClick={onPick} aria-label="Rasm tanlash">
        <Icon name="image" />
      </button>
    );
  }

  // Until the size is known the image is shown with object-fit: cover, which is exactly the starting view.
  const k = natural ? scale(view, natural) : 0;
  const style = natural
    ? {
        width: `${natural.w * k}px`,
        height: `${natural.h * k}px`,
        transform: `translate(${(side() - natural.w * k) / 2 + view.dx}px, ${(side() - natural.h * k) / 2 + view.dy}px)`,
      }
    : undefined;

  return (
    <div
      ref={frame}
      class={`image-crop ${dragging ? 'dragging' : ''} ${invalid ? 'invalid' : ''}`}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setDragging(true);
        frame.current!.setPointerCapture(e.pointerId); // keep receiving moves when the finger leaves the frame
      }}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onWheel={(e) => {
        e.preventDefault();
        change(Math.exp(-e.deltaY * 0.002), fromCenter(e.clientX, e.clientY), { x: 0, y: 0 });
      }}
    >
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        class={natural ? 'positioned' : ''}
        style={style}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        onError={onError}
      />
      <button
        class="icon-button image-crop-replace"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onPick}
        aria-label="Boshqa rasm"
      >
        <Icon name="image" />
      </button>
    </div>
  );
}
