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
 * Lets the bot message the user in a private chat (the order confirmation and the location request). Telegram
 * shows its own "allow messages" prompt once, and only if the user hasn't allowed it or started the bot already.
 * Resolves to false only if the user declined just now; the order goes through whatever the answer is.
 */
export function allowBotMessages(): Promise<boolean> {
  if (!inTelegram || askedWriteAccess || tg.initDataUnsafe.user?.allows_write_to_pm || !tg.isVersionAtLeast('6.9')) {
    return Promise.resolve(true);
  }
  askedWriteAccess = true;
  return new Promise((resolve) => tg.requestWriteAccess((allowed) => resolve(allowed)));
}

/** Order id from a group-message deep link (`?startapp=order_42`), if the app was opened by one. */
export function startOrderId(): number | null {
  const m = /^order_(\d+)$/.exec(tg.initDataUnsafe.start_param ?? '');
  return m ? Number(m[1]) : null;
}

/** Opens a point in Yandex Maps. */
export function openMap(point: LatLng) {
  const url = yandexMapUrl(point);
  if (inTelegram) tg.openLink(url);
  else window.open(url, '_blank');
}
