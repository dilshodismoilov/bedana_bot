# Agent guide

A Telegram Mini App shop with a customer side and an admin side. Read README.md for what it does and how it is deployed.

## Map

```
shared/types.ts      API contract: the types server and web both use. Start here.
shared/units.ts      sale units (dona, kg, pachka): labels, quantity steps, line totals
shared/delivery.ts   pickup branches, delivery areas, shop phone, Yandex Maps links
server/
  main.ts            starts the HTTP server
  app.ts             mounts /api, static files, SPA fallback, cache headers
  api.ts             every HTTP route plus input validation
  store.ts           ALL SQL. Returns shared types, never raw rows
  db.ts              connection + append-only migrations (PRAGMA user_version)
  auth.ts            Telegram initData verification; admin = member of the orders group
  telegram.ts        outgoing Bot API calls: group order message and its edits
  bot.ts             incoming bot messages via long polling (/start greets with a shop button, /here replies with the chat id, a location is a delivery point)
  env.ts             config from env vars
  log.ts             log.debug/info/warn/error: console plus the Telegram log group (LOG_GROUP_ID, LOG_LEVEL), batched
  api.test.ts        end-to-end API tests (temp DB, DEV mode)
  bot.test.ts        command parsing
  log.test.ts        log levels, batching, /here in the log group
web/src/
  app.tsx            all routes
  pages/             one file per screen; each page fetches its own data
  ui.tsx             MainButton, BackButton, QtyInput, Status, Icon
  tg.ts              Telegram WebApp SDK wrapper (haptics, confirm, deep links, bot messages permission)
  crop.tsx           product photo frame: drag/pinch to crop, exports the square JPEGs that are uploaded
  map.tsx            read-only map of a branch or delivery point (Leaflet, lazy-loaded)
  api.ts             fetch wrapper + useApi (stale-while-revalidate cache)
  cart.ts            cart and checkout draft (signals, persisted to localStorage)
  styles.css         all styles; colors come from Telegram theme variables
scripts/seed.ts      sample products for local dev
deploy/              systemd unit, Caddyfile, update script
```

## Verify every change

```bash
npm run check   # types
npm test        # API
npm run dev     # then open http://localhost:5173; DEV=1 in .env makes you an admin
                # http://localhost:5173/?as=<id> acts as that Telegram user in this tab (customer view)
```

For UI changes, check the affected screens in a mobile-sized browser viewport, in both light and dark. `npm run seed` fills an empty dev database.

## Rules

- **Node runs the server's TypeScript directly** (type stripping). Use erasable syntax only: no `enum`, `namespace` or constructor parameter properties. Import paths keep their `.ts`/`.tsx` extension, on the web side too, for consistency.
- **Schema changes:** append a new entry to `migrations` in `server/db.ts`. Never edit an entry that has already shipped.
- **Product photos** are a JSON array of file names in `products.images`, cover first. The form sends them as repeated `images` fields in order: a File for a new photo, the existing URL to keep one. The server deletes files that are no longer listed. The client crops every photo to a square before upload.
- **Money** is an integer number of so'm. Order items snapshot `name`, `price` and `unit`, so editing or deleting a product never changes past orders. Use `lineTotal()` for price × qty: a kg quantity can be fractional, and each line is rounded to whole so'm.
- **Units:** a product is sold per `piece` or per `kg`. Quantity rules (100 g steps for kg) live in `shared/units.ts` and are checked by the server against the product's current unit. To add a unit, extend `Unit`, `PRODUCT_UNITS` and the tables in `units.ts`.
- **Packs:** a piece product may have `pack: {size, price, unit}`. `unit` is the pack's name, chosen per product in the form: `'pack'` (pachka, the default) or `'box'` (korobka); the rules are the same. The cart keys each way to buy separately (`saleOptions()` in `cart.ts`: `"<id>"` and `"<id>:pack"`, whatever the pack is called), orders send `pack: true` on pack lines, and the order item's unit is the pack's unit (`'pack'` or `'box'`) with the pack price, so renaming a pack later doesn't change past orders. A product with a pack may have `price: null`: sold only in packs (stored as 0, because the column is NOT NULL).
- **Prices are computed on the server.** The client only sends `productId` and `qty`.
- **New API endpoint:** add the route in `api.ts`, the SQL in `store.ts`, any new types in `shared/types.ts`, and a test case in `api.test.ts`.
- **Auth:** every `/api` route requires Telegram initData (`Authorization: tma <initData>`). Wrap admin routes with `adminOnly`.
- **Language:** the UI and the bot messages are in Uzbek (Latin script). Write the apostrophe as a straight `'`.
- **UI principle:** no helper labels, hints or explanatory text. If a screen needs one, fix the layout instead. Placeholders serve as field labels. Use Telegram's MainButton (via `ui.tsx`) for the screen's primary action and `BackButton to=...` with an explicit parent screen.
- **Deep link:** the group message button opens `APP_LINK?startapp=order_<id>`. `main.tsx` turns that into the `/orders/<id>` route (and `startapp=cart`, from the bot's reply to a location, into `/cart`). That order screen shows no back button, so Telegram shows its close button and one tap returns to the group.
- **Ports:** the server reads `API_PORT`, not `PORT`, because dev tools often inject `PORT` for themselves. Vite is pinned to 5173 with `strictPort`.
- **Order statuses** are independent timestamps (`paid_at`, `completed_at`); an order is closed when all are set. To add one: a migration column, `OrderStatus` in `shared/types.ts`, `STATUS_COLUMN` in `store.ts`, the route list in `api.ts`, `STATUS_TEXT` in `pages/Order.tsx`, and the status line in `telegram.ts`.
- **Pickup or delivery:** every new order has a `fulfillment` id from `shared/delivery.ts` (stored as text, so never rename an id; add new ones). Pickup options name a branch and need no customer location (`location` is null); every other option is delivered. Branch coordinates, labels and the shop phone are edited there, and the cart, order page and bot messages all read them from there. To take an option off checkout for a while, set `hidden: true` on it: the cart stops listing it and the server rejects it for new orders, while past orders keep showing it.
- **Delivery location** is a point (`location: {lat, lng}`), not an address, and the customer sends it in the bot chat before ordering, not in the app. The cart's send-location button calls `POST /location/request`: the bot sends `locationRequest()` (a share-location keyboard button) and the app opens the bot chat and closes. `bot.ts` saves any location sent in the private chat per customer (`user_locations`, the latest replaces the earlier one) and replies with a button to `APP_LINK?startapp=cart`, which `main.tsx` opens on the cart. `/me` returns it as `location`; the cart shows it and requires it for a delivery, and `createOrder()` copies it onto the order (the server rejects a delivery without one). The group gets a native Telegram location message as a reply to each delivery order. Map links open Yandex Maps (`yandexMapUrl()`). Map tiles come from OpenStreetMap's public tile server, which is fine for a small shop; if traffic grows, switch the tile URL in `map.tsx` to a paid provider.
- **Bot commands and messages:** add a handler in `bot.ts` `handle()`. Polling starts from `main.ts` only, so tests never talk to Telegram. One poller per bot token: a second process gets "Conflict" errors.
- **Telegram limits:** `web_app` inline buttons don't work in groups, which is why the group message uses a `t.me` URL button. A bot can only message a user privately after they started it or allowed it: checkout calls `allowBotMessages()` (`tg.ts`) first, and `notifyCustomer()` treats Telegram's refusal as normal.
- **Logging:** use `log.*` from `log.ts`, not `console.*`. Messages are Telegram HTML: wrap user text in `esc()` and mention users with `who()`. Pick the level by who needs to see it: `info` for usage (someone did something), `warn` for things worth a look (slow, refused, a customer stuck), `error` for bugs and failures (pass `stack(e)` as the detail). The API middleware in `api.ts` already logs every request (debug), slow ones and 401/403 (warn), refused input (warn) and server errors (error), so routes only log their own events. The web app reports its opens (`/visit`) and uncaught errors (`/client-error`) from `main.tsx`.
- **Local dev with the real bot token:** run with `BOT_TOKEN=` (empty, overrides `.env`) when the production server is running, or the two pollers conflict.
