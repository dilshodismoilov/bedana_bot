# Bedana shop

Telegram Mini App for selling quail eggs and similar products. Customers browse, fill a cart and place an order; the order is posted to a private Telegram group with an **Ochish** button that opens the order in the app. Payment happens outside the app; an admin marks the order as paid, and the group message updates itself.

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

| Command | Description |
| --- | --- |
| `npm run dev` | API on :3000 with auto-restart, plus Vite on :5173 with hot reload |
| `npm run check` | Typecheck everything |
| `npm test` | API tests against a temporary database |
| `npm run build` | Build the Mini App into `dist/` |
| `npm start` | Production server (serves `dist/`) |

## Telegram setup

1. **Bot.** In [@BotFather](https://t.me/BotFather), use `/newbot` and copy the token into `BOT_TOKEN`.
2. **Mini App.** In BotFather, use `/newapp`, choose the bot, and set the URL to `https://your-domain`. Pick a short name such as `shop`. Then set `APP_LINK=https://t.me/<bot_username>/shop`.
   Also set *Bot Settings → Menu Button* to the same URL, so customers can open the shop from the bot chat.
3. **Orders group.** Create a private group, add the bot, and send any message. Open `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` and copy `chat.id` (a negative number) into `GROUP_ID`.
   The bot never reads updates itself, so this URL is safe to use.

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
