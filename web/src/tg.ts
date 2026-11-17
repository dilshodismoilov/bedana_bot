// Thin wrapper over the Telegram WebApp SDK (loaded by index.html).
// Outside Telegram (local dev in a browser) `inTelegram` is false and native UI is replaced by HTML fallbacks.

import type { LatLng } from '../../shared/types.ts';

export const tg = window.Telegram.WebApp;
export const inTelegram = Boolean(tg.initData);

export const haptic = {
  tap: () => inTelegram && tg.HapticFeedback.selectionChanged(),
  success: () => inTelegram && tg.HapticFeedback.notificationOccurred('success'),
  error: () => inTelegram && tg.HapticFeedback.notificationOccurred('error'),
};

export function confirm(message: string): Promise<boolean> {
  if (!inTelegram) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => tg.showConfirm(message, resolve));
}

export function alert(message: string): void {
  if (inTelegram) tg.showAlert(message);
  else window.alert(message);
}

/** Order id from a group-message deep link (`?startapp=order_42`), if the app was opened by one. */
export function startOrderId(): number | null {
  const m = /^order_(\d+)$/.exec(tg.initDataUnsafe.start_param ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * The device's current position, or null if unavailable/denied.
 * Uses Telegram's LocationManager (Bot API 8.0+) so the permission prompt is Telegram's own;
 * falls back to the browser API on older clients and in local dev.
 * `userAction`: the user tapped a button, so if they denied access earlier, open the settings to re-allow it.
 */
export function currentLocation({ userAction = false } = {}): Promise<LatLng | null> {
  if (!inTelegram || !tg.isVersionAtLeast('8.0')) return browserLocation();
  const lm = tg.LocationManager;
  return new Promise((resolve) => {
    const ask = () => {
      if (!lm.isLocationAvailable) return resolve(null);
      if (lm.isAccessRequested && !lm.isAccessGranted) {
        if (userAction) lm.openSettings();
        return resolve(null);
      }
      lm.getLocation((d) => resolve(d ? { lat: d.latitude, lng: d.longitude } : null));
    };
    if (lm.isInited) ask();
    else lm.init(ask);
  });
}

function browserLocation(): Promise<LatLng | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    ),
  );
}

/** Opens a point in the user's maps app. */
export function openMap({ lat, lng }: LatLng) {
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank');
}
