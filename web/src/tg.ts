// Thin wrapper over the Telegram WebApp SDK (loaded by index.html).
// Outside Telegram (local dev in a browser) `inTelegram` is false and native UI is replaced by HTML fallbacks.

import { yandexMapUrl } from '../../shared/delivery.ts';
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

/**
 * Sends the main button's current state to Telegram again. Some Telegram clients apply a text change only
 * when the next update arrives, so while typing a quantity the button showed the previous total. The SDK skips
 * updates identical to the last one, so this posts the same payload it sends (built from the public getters).
 */
export function repaintMainButton() {
  const mb = tg.MainButton;
  if (!inTelegram || !mb.isVisible) return;
  const webView = (window.Telegram as unknown as { WebView: { postEvent(e: string, cb: false, data: object): void } }).WebView;
  webView.postEvent('web_app_setup_main_button', false, {
    is_visible: true,
    is_active: mb.isActive,
    is_progress_visible: mb.isProgressVisible,
    icon_custom_emoji_id: mb.iconCustomEmojiId,
    text: mb.text,
    color: mb.color,
    text_color: mb.textColor,
    has_shine_effect: mb.hasShineEffect && mb.isActive && !mb.isProgressVisible,
  });
}

let askedWriteAccess = false;

/**
 * Lets the bot message the user in a private chat (the order confirmation). Telegram shows its own
 * "allow messages" prompt once, and only if the user hasn't allowed it or started the bot already.
 * Resolves either way: the order goes through whatever the answer is.
 */
export function allowBotMessages(): Promise<void> {
  if (!inTelegram || askedWriteAccess || tg.initDataUnsafe.user?.allows_write_to_pm || !tg.isVersionAtLeast('6.9')) {
    return Promise.resolve();
  }
  askedWriteAccess = true;
  return new Promise((resolve) => tg.requestWriteAccess(() => resolve()));
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

/** Opens a point in Yandex Maps. */
export function openMap(point: LatLng) {
  const url = yandexMapUrl(point);
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank');
}
