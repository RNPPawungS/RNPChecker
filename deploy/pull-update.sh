#!/usr/bin/env bash
# ดึงโค้ดล่าสุดจาก GitHub แล้วอัปเดตเว็บ packing (รันเป็น root)
# ใช้: packing-update            -> อัปเดตเป็นเวอร์ชันล่าสุดของ branch main
#      packing-update --check    -> ดูว่ามีอะไรใหม่บน GitHub โดยยังไม่อัปเดต
set -euo pipefail
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
BRANCH="${PACKING_BRANCH:-main}"
cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "มีไฟล์ถูกแก้ไขใน $REPO โดยตรง กรุณาตรวจสอบก่อน (git status)"; git status --short; exit 1
fi

git fetch --quiet origin "$BRANCH"
OLD=$(git rev-parse HEAD); NEW=$(git rev-parse "origin/$BRANCH")
DEPLOYED=$(cat /opt/packing/REVISION 2>/dev/null || echo none)
echo "ที่ลงไว้บนเว็บ: ${DEPLOYED:0:7}   ล่าสุดบน GitHub: ${NEW:0:7}"
if [ "$OLD" != "$NEW" ]; then echo "== commit ใหม่:"; git log --oneline "$OLD..$NEW"; fi

if [ "${1:-}" = "--check" ]; then exit 0; fi
if [ "$OLD" = "$NEW" ] && [ "$DEPLOYED" = "$NEW" ]; then echo "เป็นเวอร์ชันล่าสุดแล้ว ไม่ต้องอัปเดต"; exit 0; fi

git merge --ff-only --quiet "origin/$BRANCH"
bash "$REPO/deploy/update.sh"
git rev-parse HEAD > /opt/packing/REVISION
echo "== อัปเดตเป็น $(git log -1 --format='%h %s')"
