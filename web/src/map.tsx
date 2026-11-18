// Delivery-location maps (Leaflet + OpenStreetMap tiles, no API key).
// Leaflet is loaded on demand, so screens without a map don't pay for it.
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LatLng } from '../../shared/types.ts';
import { currentLocation, haptic, openMap } from './tg.ts';
import { Icon } from './ui.tsx';

const TASHKENT: LatLng = { lat: 41.3111, lng: 69.2797 };
const CITY_ZOOM = 12;
const STREET_ZOOM = 17;

async function createMap(el: HTMLElement, center: LatLng, zoom: number, interactive: boolean): Promise<LeafletMap> {
  const mod = await import('leaflet');
  const L: typeof mod = (mod as any).default ?? mod;
  const map = L.map(el, {
    zoomControl: false,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    scrollWheelZoom: interactive,
    boxZoom: false,
    keyboard: false,
    // Leaflet's default flick speed is unlimited; a fast swipe would throw the pin far from where the user aimed.
    inertiaMaxSpeed: 1000,
    inertiaDeceleration: 4000,
  }).setView(center, zoom);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  return map;
}

/** ~10 cm precision is plenty and keeps payloads tidy. */
const round = ({ lat, lng }: LatLng): LatLng => ({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });

function Pin() {
  return (
    <svg class="map-pin" viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z" />
      <circle cx="12" cy="11.5" r="4.5" />
    </svg>
  );
}

type PickerProps = { value: LatLng | null; center?: LatLng; onChange: (p: LatLng) => void; invalid?: boolean };

/**
 * The customer moves the map under a fixed center pin. Starts at `value` (e.g. the last order's location)
 * or asks for the device location, showing `center`'s city meanwhile. `onChange` fires once a point is
 * actually chosen, never for the default city view.
 */
export function LocationPicker({ value, center = TASHKENT, onChange, invalid }: PickerProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const [locating, setLocating] = useState(false);

  async function locate(userAction: boolean) {
    setLocating(true);
    const here = await currentLocation({ userAction });
    setLocating(false);
    if (!here) return userAction && haptic.error();
    map.current?.setView(here, STREET_ZOOM);
    changed.current(round(here));
  }

  useEffect(() => {
    let cancelled = false;
    createMap(el.current!, value ?? center, value ? STREET_ZOOM : CITY_ZOOM, true).then((m) => {
      if (cancelled) return m.remove();
      map.current = m;
      let touched = false;
      m.on('dragstart zoomstart', () => (touched = true));
      m.on('moveend', () => touched && changed.current(round(m.getCenter())));
      if (!value) locate(false);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
    };
  }, []);

  // Another delivery area chosen before a point was: show its city.
  useEffect(() => {
    if (!value) map.current?.setView(center, CITY_ZOOM);
  }, [center.lat, center.lng]);

  return (
    <div class={`map ${invalid ? 'invalid' : ''}`} id="location">
      <div ref={el} class="map-canvas" />
      <Pin />
      <button class="icon-button map-locate" onClick={() => locate(true)} aria-label="Mening joylashuvim" disabled={locating}>
        {locating ? <span class="spinner" /> : <Icon name="locate" />}
      </button>
    </div>
  );
}

/** Read-only map of a delivery point; tapping opens it in a maps app. */
export function LocationPreview({ value }: { value: LatLng }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let m: LeafletMap | undefined;
    createMap(el.current!, value, STREET_ZOOM - 1, false).then((created) => {
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
