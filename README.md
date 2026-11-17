# Bedana shop

Telegram Mini App for selling quail eggs and similar products. Customers browse, fill a cart, drop a pin on the map for delivery and place an order. The order is posted to a private Telegram group with an **Ochish** button that opens the order in the app, followed by the delivery location as a Telegram location message. Payment happens outside the app; an admin marks the order as paid, and the group message updates itself.

- **Admins are the members of the orders group.** To add an admin, add them to the group; to remove one, remove them from it.
- Prices are per piece in so'm. There is no stock tracking.
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
