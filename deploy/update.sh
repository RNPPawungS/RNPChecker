#!/usr/bin/env bash
# อัปเดตโค้ด packing บนเซิร์ฟเวอร์ (รันเป็น root) จากโฟลเดอร์ที่แตกไฟล์ bundle ไว้
# ไม่แตะ .env, network หรือ SSH. สำรองโค้ดเดิมไว้ที่ /root/packing-backup-<เวลา>
set -euo pipefail
SRC="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
APP=/opt/packing
TS=$(date +%Y%m%d-%H%M%S)
BK=/root/packing-backup-$TS

echo "== backup to $BK"
mkdir -p "$BK"
cp -a "$APP"/package.json "$APP"/src "$APP"/views "$APP"/public "$APP"/sql "$BK"/
[ -f "$APP/package-lock.json" ] && cp -a "$APP/package-lock.json" "$BK"/
mysqldump --single-transaction packing > "$BK/packing.sql"

echo "== copy new code"
rm -rf "$APP/src" "$APP/views" "$APP/public"
cp -a "$SRC"/src "$SRC"/views "$SRC"/public "$APP"/
cp -a "$SRC"/sql/. "$APP"/sql/
cp -a "$SRC"/package.json "$SRC"/package-lock.json "$APP"/
cd "$APP" && npm install --omit=dev --no-audit --no-fund

echo "== database migration"
migrate() { # $1 = table that the migration creates, $2 = file
  if [ "$(mysql -N packing -e "SHOW TABLES LIKE '$1'")" = "" ]; then mysql packing < "$APP/sql/$2" && echo "$2 applied"; else echo "$2 already applied"; fi
}
migrate upload_rows migrate-002-import-detail.sql
migrate check_logs migrate-003-checker.sql
migrate activity_logs migrate-005-activity.sql
migrate_col() { # $1 = table, $2 = column that the migration adds, $3 = file
  if [ "$(mysql -N packing -e "SHOW COLUMNS FROM $1 LIKE '$2'")" = "" ]; then mysql packing < "$APP/sql/$3" && echo "$3 applied"; else echo "$3 already applied"; fi
}
migrate_col users deleted_at migrate-004-users.sql

chown -R packing:packing "$APP"
systemctl restart packing
sleep 2
systemctl is-active packing
journalctl -u packing -n 5 --no-pager
curl -sk -o /dev/null -w "login page: %{http_code}\n" --resolve packing.rnpexpress.co.th:443:127.0.0.1 https://packing.rnpexpress.co.th/login
echo "== done. rollback: cp -a $BK/{src,views,public,package.json} $APP/ && systemctl restart packing"
