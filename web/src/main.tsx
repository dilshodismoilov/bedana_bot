import { render } from 'preact';
import { api } from './api.ts';
import { App } from './app.tsx';
import { inTelegram, startedForCart, startOrderId, tg } from './tg.ts';
import './styles.css';

if (inTelegram) {
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes(); // scrolling long lists must not collapse the app
  tg.setHeaderColor('secondary_bg_color');
  tg.setBackgroundColor('secondary_bg_color');
}

// Opened from an order message in the group: start on that order.
const orderId = startOrderId();
if (orderId) history.replaceState(null, '', `/orders/${orderId}`);
// Back from the bot chat after sending the delivery location: continue checkout.
else if (startedForCart()) history.replaceState(null, '', '/cart');

render(<App />, document.getElementById('app')!);

// Usage and errors for the shop's log group (server/log.ts). Failures here never bother the user.
api('/visit', { method: 'POST', json: { start: tg.initDataUnsafe.start_param ?? '', platform: tg.platform, version: tg.version } }).catch(() => {});

let reported = 0;
function reportError(message: unknown, stack: unknown) {
  if (reported++ >= 5) return; // a broken screen can throw on every render
  const json = { message: String(message), stack: typeof stack === 'string' ? stack : '', path: location.pathname };
  api('/client-error', { method: 'POST', json }).catch(() => {});
}
window.addEventListener('error', (e) => reportError(e.message, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason?.message ?? e.reason, e.reason?.stack));
