#!/usr/bin/env bash
# Pull the latest code, rebuild the web app and restart. Run on the server as the bedana user: ./deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
sudo systemctl restart bedana
echo "Deployed $(git rev-parse --short HEAD)"
