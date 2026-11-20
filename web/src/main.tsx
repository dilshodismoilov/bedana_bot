import { render } from 'preact';
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
