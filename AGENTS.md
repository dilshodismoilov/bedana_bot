# Agent guide

A Telegram Mini App shop with a customer side and an admin side. Read README.md for what it does and how it is deployed.

## Map

```
shared/types.ts      API contract: the types server and web both use. Start here.
server/
  main.ts            starts the HTTP server
  app.ts             mounts /api, static files, SPA fallback, cache headers
  api.ts             every HTTP route plus input validation
  store.ts           ALL SQL. Returns shared types, never raw rows
  db.ts              connection + append-only migrations (PRAGMA user_version)
  auth.ts            Telegram initData verification; admin = member of the orders group
  telegram.ts        outgoing Bot API calls: group order message and its edits
  bot.ts             incoming bot commands via long polling (/here replies with the chat id)
  env.ts             config from env vars
  api.test.ts        end-to-end API tests (temp DB, DEV mode)
  bot.test.ts        command parsing
web/src/
  app.tsx            all routes
  pages/             one file per screen; each page fetches its own data
  ui.tsx             MainButton, BackButton, QtyInput, Status, Icon
  tg.ts              Telegram WebApp SDK wrapper (haptics, confirm, deep link, device location)
  map.tsx            delivery-location map: picker at checkout, preview on orders (Leaflet, lazy-loaded)
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
- **Money** is an integer number of so'm. Order items snapshot `name` and `price`, so editing or deleting a product never changes past orders.
- **Prices are computed on the server.** The client only sends `productId` and `qty`.
- **New API endpoint:** add the route in `api.ts`, the SQL in `store.ts`, any new types in `shared/types.ts`, and a test case in `api.test.ts`.
- **Auth:** every `/api` route requires Telegram initData (`Authorization: tma <initData>`). Wrap admin routes with `adminOnly`.
- **Language:** the UI and the bot messages are in Uzbek (Latin script). Write the apostrophe as a straight `'`.
- **UI principle:** no helper labels, hints or explanatory text. If a screen needs one, fix the layout instead. Placeholders serve as field labels. Use Telegram's MainButton (via `ui.tsx`) for the screen's primary action and `BackButton to=...` with an explicit parent screen.
- **Deep link:** the group message button opens `APP_LINK?startapp=order_<id>`. `main.tsx` turns that into the `/orders/<id>` route.
- **Ports:** the server reads `API_PORT`, not `PORT`, because dev tools often inject `PORT` for themselves. Vite is pinned to 5173 with `strictPort`.
- **Order statuses** are independent timestamps (`paid_at`, `completed_at`); an order is closed when all are set. To add one: a migration column, `OrderStatus` in `shared/types.ts`, `STATUS_COLUMN` in `store.ts`, the route list in `api.ts`, `STATUS_TEXT` in `pages/Order.tsx`, and the status line in `telegram.ts`.
- **Delivery location** is a map pin (`location: {lat, lng}`), not an address. Map tiles come from OpenStreetMap's public tile server, which is fine for a small shop; if traffic grows, switch the tile URL in `map.tsx` to a paid provider. The group gets a native Telegram location message as a reply to each order.
- **Bot commands:** add a handler in `bot.ts` `handle()`. Polling starts from `main.ts` only, so tests never talk to Telegram. One poller per bot token: a second process gets "Conflict" errors.
- **Telegram limits:** `web_app` inline buttons don't work in groups, which is why the group message uses a `t.me` URL button.
