#!/usr/bin/env bash
# Run as root on the Ubuntu 24.04 server from the folder that contains the app (package.json).
# Does NOT touch network or SSH settings. Opens only 80/443 in ufw if ufw is active.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/packing

export DEBIAN_FRONTEND=noninteractive
timedatectl set-timezone Asia/Bangkok
apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx mysql-server certbot python3-certbot-nginx python3-certbot-dns-cloudflare
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id packing >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin packing
mkdir -p "$APP"
cp -r "$SRC"/{package.json,src,views,public,sql} "$APP"/
cd "$APP" && npm install --omit=dev --no-audit --no-fund

# MySQL: local only
systemctl enable --now mysql
if [ ! -f "$APP/.env" ]; then
  DBPW=$(openssl rand -hex 16); SS=$(openssl rand -hex 32)
  mysql -e "CREATE DATABASE IF NOT EXISTS packing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER IF NOT EXISTS 'packing'@'localhost' IDENTIFIED BY '$DBPW';
            ALTER USER 'packing'@'localhost' IDENTIFIED BY '$DBPW';
            GRANT ALL PRIVILEGES ON packing.* TO 'packing'@'localhost'; FLUSH PRIVILEGES;"
  sed -e "s/^SESSION_SECRET=.*/SESSION_SECRET=$SS/" -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$DBPW/" "$SRC/.env.example" > "$APP/.env"
fi
mysql packing < "$APP/sql/schema.sql"
chown -R packing:packing "$APP"; chmod 600 "$APP/.env"

cp "$SRC/deploy/packing.service" /etc/systemd/system/packing.service
if [ ! -f /etc/ssl/packing/packing.crt ]; then
  mkdir -p /etc/ssl/packing
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=packing.rnpexpress.co.th/O=RNP Express" \
    -addext "subjectAltName=DNS:packing.rnpexpress.co.th" -keyout /etc/ssl/packing/packing.key -out /etc/ssl/packing/packing.crt
  chmod 600 /etc/ssl/packing/packing.key
fi
cp "$SRC/deploy/nginx-packing.conf" /etc/nginx/sites-available/packing
ln -sf /etc/nginx/sites-available/packing /etc/nginx/sites-enabled/packing
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl daemon-reload && systemctl enable packing && systemctl restart packing

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 'Nginx Full'; fi
echo "Done. Edit $APP/.env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) then: systemctl restart packing"
