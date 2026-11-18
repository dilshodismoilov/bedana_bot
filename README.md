# Bedana shop

Telegram Mini App for selling quail eggs and similar products. Customers browse, open a product to see its photos and description, fill a cart, drop a pin on the map for delivery and place an order. The order is posted to a private Telegram group with an **Ochish** button that opens the order in the app, followed by the delivery location as a Telegram location message. In a private chat, /start greets the customer with a button that opens the shop. The customer gets a confirmation in their private chat with the bot (the app asks Telegram for permission to message them at checkout). Payment happens outside the app. Admins switch each order to paid and to completed (delivered) independently, and the group message updates itself.

- **Admins are the members of the orders group.** To add an admin, add them to the group; to remove one, remove them from it.
- Each product has up to 10 photos (the first one is the catalog cover), a price in so'm per piece or per kilogram, and an optional description. Kilogram quantities go in 100 g steps (1,5 kg). A product sold by the piece can also have a pack (e.g. 10 pieces) with its own price; customers then order pieces, packs or both. Leave the piece price empty to sell a product only in packs. There is no stock tracking.
- Everything the shop stores is in `data/`: the SQLite database and the uploaded images.

Stack: Node.js 24 + [Hono](https://hono.dev) + built-in `node:sqlite` on the server (TypeScript runs directly, no server build). Preact + Vite for the Mini App. One process serves the API, the app and the images.

## Run locally

```bash
npm install
cp .env.example .env     # set DEV=1
npm run seed             # optional: sample products
npm run dev              # http://localhost:5173
```

With `DEV=1`, requests that don't come from Telegram act as an admin user, so the whole app (shop and admin) works in a normal browser. Telegram's native buttons are replaced by in-page ones.

To act as a specific user, open `http://localhost:5173/?as=<telegram user id>`. The choice is remembered per browser tab, so one tab can be a customer and another an admin. When `BOT_TOKEN` and `GROUP_ID` are set, admin rights come from real group membership, and orders are posted to the real group.

| Command | Description |
| --- | --- |
| `npm run dev` | API on :3000 (`API_PORT`) with auto-restart, plus Vite on :5173 with hot reload |
| `npm run check` | Typecheck everything |
| `npm test` | API tests against a temporary database |
| `npm run build` | Build the Mini App into `dist/` |
| `npm start` | Production server (serves `dist/`) |

## Telegram setup

1. **Bot.** In [@BotFather](https://t.me/BotFather), use `/newbot` and copy the token into `BOT_TOKEN`.
2. **Mini App.** In BotFather: */mybots → your bot → Bot Settings → Configure Mini App → Enable Mini App*. Set the URL to `https://your-domain` and the screen mode to **Fullsize**. Then set `APP_LINK=https://t.me/<bot_username>`.
3. **Orders group.** Create a private group and add the bot. With the server running, send `/here` in the group, and the bot replies with `GROUP_ID=…`. Put that line in `.env` and restart the server. The bot answers ✅ to `/here` once the group is connected.
   Every member of this group is a shop admin.

The server starts without `GROUP_ID`, so step 3 works on a fresh install; until it's set, orders aren't posted anywhere. Only one process can receive the bot's commands at a time. Don't run a local dev server with the production bot token while the VPS is running.

## Temporary demo on GitHub Actions

Until a server is available, [.github/workflows/demo.yml](.github/workflows/demo.yml) runs the shop on a GitHub runner for up to 5½ hours per run, exposed through a Cloudflare Tunnel. This is a stopgap: GitHub's terms don't allow Actions as permanent hosting.

1. **Secrets** (repo *Settings → Secrets and variables → Actions*): `BOT_TOKEN`, `GROUP_ID`, `APP_LINK`.
2. **Run:** *Actions → Demo server → Run workflow*. The bot posts the run's address (`https://….trycloudflare.com`, new every run) to the orders group.
3. **BotFather:** set the Mini App URL to that address. Repeat this every run.

To use a fixed address on your own domain instead, add the domain to Cloudflare, create a tunnel in *Zero Trust → Networks → Tunnels* with a public hostname pointing to `http://localhost:3000`, and save its token as the `CLOUDFLARE_TUNNEL_TOKEN` secret. Runs then use that hostname, and the BotFather URL never changes.

Products and orders are saved to the Actions cache when a run ends and restored by the next run. Starting a new run stops the current one. Don't run a local server with the same bot token at the same time.

## Deploy (Ubuntu)

```bash
# Node 24 and Caddy
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs caddy git

# App
sudo useradd --system --create-home --home-dir /opt/bedana bedana
sudo -u bedana git clone <repo-url> /opt/bedana
cd /opt/bedana
sudo -u bedana npm ci
sudo -u bedana npm run build
sudo -u bedana cp .env.example .env    # fill BOT_TOKEN, GROUP_ID, APP_LINK; keep DEV=0

# Service + HTTPS
sudo cp deploy/bedana.service /etc/systemd/system/
sudo systemctl enable --now bedana
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # replace shop.example.com with your domain
sudo systemctl reload caddy
```

Point the domain's DNS A record at the server before reloading Caddy. Caddy issues the HTTPS certificate itself, and Telegram requires HTTPS.

- **Update:** `sudo -u bedana ./deploy/update.sh`. Allow the `bedana` user to run `systemctl restart bedana` via sudoers, or run the restart yourself.
- **Logs:** `journalctl -u bedana -f`
- **Backup:** copy `/opt/bedana/data/`. For a consistent copy of the database while the app is running, use `sqlite3 data/shop.db ".backup backup.db"`.
