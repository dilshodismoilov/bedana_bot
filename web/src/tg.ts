// Thin wrapper over the Telegram WebApp SDK (loaded by index.html).
// Outside Telegram (local dev in a browser) `inTelegram` is false and native UI is replaced by HTML fallbacks.

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
