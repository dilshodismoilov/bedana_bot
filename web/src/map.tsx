// Read-only maps of a branch or delivery point (Leaflet + OpenStreetMap tiles, no API key).
// Leaflet is loaded on demand, so screens without a map don't pay for it.
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'preact/hooks';
import type { LatLng } from '../../shared/types.ts';
import { openMap } from './tg.ts';

const ZOOM = 16;

async function createMap(el: HTMLElement, center: LatLng): Promise<LeafletMap> {
  const mod = await import('leaflet');
  const L: typeof mod = (mod as any).default ?? mod;
  const map = L.map(el, {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
  }).setView(center, ZOOM);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  return map;
}

function Pin() {
  return (
    <svg class="map-pin" viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z" />
      <circle cx="12" cy="11.5" r="4.5" />
    </svg>
  );
}

/** Read-only map of a point with a pin; tapping opens it in a maps app. */
export function LocationPreview({ value }: { value: LatLng }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let m: LeafletMap | undefined;
    createMap(el.current!, value).then((created) => {
      if (cancelled) created.remove();
      else m = created;
    });
    return () => {
      cancelled = true;
      m?.remove();
    };
  }, [value.lat, value.lng]);

  return (
    <button class="map map-preview" onClick={() => openMap(value)} aria-label="Xaritada ochish">
      <div ref={el} class="map-canvas" />
      <Pin />
    </button>
  );
}
