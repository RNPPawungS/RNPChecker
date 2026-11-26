# RNP Checker (packing)

เว็บแอปจัดการและตรวจสอบข้อมูลกล่องพัสดุ ใช้งานที่ `https://packing.rnpexpress.co.th` (ภายในองค์กร)

**Stack:** Node.js 22 (Express + EJS) · MySQL 8 · Nginx · Google OAuth

## ฟีเจอร์
- **Login ด้วย Google** ใช้บัญชี Google ใดก็ได้ ผู้ใช้คนแรกเป็น admin ส่วนผู้ใช้ใหม่ต้องรอ admin อนุมัติ (เมนู "ผู้ใช้งาน")
  - admin เพิ่มผู้ใช้ล่วงหน้าด้วย email ได้ (เข้าสู่ระบบด้วย Google ของ email นั้นได้ทันทีไม่ต้องรออนุมัติ) และลบผู้ใช้ได้ ผู้ใช้ที่ลบจะเข้าเว็บและแอปไม่ได้ แต่ประวัติการ Import / การตรวจ / การใช้งานยังแสดง email เดิม ถ้ากลับมา login ใหม่ต้องรออนุมัติอีกครั้ง
- **จัดการข้อมูล** Box No. / Waybill No. / Operation Date ค้นหา กรองช่วงวันที่ (dd/mm/yyyy) เพิ่ม แก้ไข ลบ ส่งออก Excel (ถ้าไม่ได้ค้นหาหรือเลือกช่วงวันที่ จะถามยืนยันก่อน เพราะอาจใช้เวลานาน)
  - ปุ่ม **ดาวน์โหลด Template** (.xlsx) และ **Import ข้อมูล** (.xlsx / .csv) ถ้า Waybill ซ้ำจะอัปเดตทับ มีหน้าผลการ import รายแถว (เพิ่มใหม่ / อัปเดต / ไม่เปลี่ยนแปลง / ผิดพลาด พร้อมค่าก่อน-หลัง) ดาวน์โหลดผลเป็น Excel ได้ และหน้า **ประวัติ Import**
- **เชื่อม Google Sheet (Connector)** เซิร์ฟเวอร์อ่าน sheet `DATA` ของ Google Sheet ทุก 60 วินาที แถวที่ช่อง `flag_upload` ยังไม่เป็น `true` คือแถวใหม่ จะถูก Import เหมือนอัปโหลดไฟล์ (`DATE` → Operation Date ตัดเวลาออก, `CTN NO.` → Box No., `AWB` → Waybill No. ทำความสะอาดเลขแบบเดียวกับการสแกน) แล้วเขียน `true` ลง `flag_upload` ของแถวที่บันทึกแล้ว ผลอยู่ในหน้า **ประวัติ Import** (ผู้ Import = `google-sheet@connector`) และ **ประวัติการใช้งาน** (การกระทำ "Import ผ่าน Google Sheet (Connector)" พร้อมจำนวน record) admin กด "ตรวจ Sheet ตอนนี้" ในหน้าประวัติ Import ได้
  - แถวที่ผิด (ไม่มี AWB / วันที่ผิด) แจ้งใน Import ครั้งเดียว ไม่เขียน flag เมื่อแก้ใน sheet แล้วจะถูก Import รอบถัดไป · AWB ซ้ำกันหลายแถว ใช้แถวล่างสุด
  - Import ทีละรายการเท่านั้น ถ้ามีคนอัปโหลดไฟล์จากหน้าเว็บระหว่างที่ sheet กำลัง Import หน้าเว็บจะขึ้นหน้าจอ "กรุณารอสักครู่" แล้วบันทึกต่อให้เองเมื่อเสร็จ ([src/lock.js](src/lock.js))
- **ประวัติการใช้งาน** (เฉพาะ admin) ใครทำอะไรเมื่อไร: เข้า/ออกจากระบบ, เข้าสู่ระบบแอป Android, เพิ่ม/แก้ไข/ลบข้อมูล, Import, ส่งออก Excel, ดาวน์โหลด Template, จัดการผู้ใช้ และการตรวจของ Checker ตัวกรองอยู่ที่หัวคอลัมน์แบบ Google Sheets (กดรูปกรวย): เวลา (ช่วงวันที่ / วันนี้ / 7 / 30 วันล่าสุด), ผู้ใช้ และการกระทำ (ติ๊กเลือกได้หลายรายการ), รายละเอียด (ค้นหาข้อความ) ตัวกรองที่ใช้อยู่แสดงเป็นป้ายด้านบน กด × เพื่อเอาออกทีละอัน หรือกด "ล้างตัวกรอง" เพื่อล้างทั้งหมด แสดงหน้าละ 100 รายการ ล่าสุดก่อน เลื่อนหน้าด้วยปุ่ม « ‹ › » หรือพิมพ์เลขหน้าในช่อง "หน้า X จาก Y" (ดึงจากฐานข้อมูลเฉพาะ 100 แถวของหน้านั้น หน้าครึ่งหลังนับจากรายการเก่าสุด จึงเร็วทั้งหน้าแรกและหน้าสุดท้าย)
- **Checker** (รองรับเครื่องยิงบาร์โค้ด)
  - *Ref Check* ใส่ Waybill No. จะได้ Box No. ใส่ Box No. จะได้รายการ Waybill
  - *Cross Ref Check* ตรวจคู่ Waybill/Box เลือกลำดับได้ แสดงผลตรง/ไม่ตรงชัดเจนพร้อมเสียง
  - เลือก Operation Date (ค่าเริ่มต้นวันนี้) แล้วค้นหาเฉพาะวันนั้น ทำความสะอาดเลขที่ยิงมาให้อัตโนมัติ (ดู [src/barcode.js](src/barcode.js)): ตัด `*` (Code 39), `^` หน้า/ท้าย, ตัวอักษร start/stop ของ Codabar A-D / T N E (เช่น `D3867497060D` → `3867497060`), รหัสชนิดบาร์โค้ด AIM เช่น `]C0` `]F0`, อักขระควบคุม (STX/ETX, GS/FNC1, Enter, Tab) และแปลงตัวอักษรที่พิมพ์ผิดเพราะคีย์บอร์ดเป็นภาษาไทย ใช้กับแอป Android, หน้าข้อมูล (ค้นหา/เพิ่ม) และไฟล์ที่อัปโหลดด้วย โดยไม่ต้องอัปเดตแอป มีบันทึกประวัติการตรวจ

- **3 ภาษา ไทย / English / 繁體中文 (จีนตัวเต็ม)** สลับด้วยปุ่มธงมุมขวาบน (ไทย / สหราชอาณาจักร / จีน) ค่าเริ่มต้นภาษาไทย ระบบจำภาษาที่เลือกไว้ในเบราว์เซอร์ 1 ปี คำแปลภาษาอังกฤษอยู่ใน `src/i18n.js` ภาษาจีนอยู่ใน `src/i18n-zh.js` ข้อความในหน้าเว็บเขียนเป็นภาษาไทยแล้วครอบด้วย `t('...')` เมื่อเพิ่มข้อความใหม่ให้เพิ่มคำแปลทั้ง 2 ไฟล์ (ถ้าภาษาจีนยังไม่มี จะแสดงภาษาอังกฤษแทน)
- **แอป Android (Checker)** สำหรับเครื่อง handheld ดาวน์โหลดและจับคู่เครื่องได้ที่เมนู "แอป Android (Checker)" รายละเอียดใน [android/README.md](android/README.md)

## โครงสร้าง
```
src/        app.js (routes หลัก), imports.js (Import), importcore.js (บันทึก Import), sheet.js (Google Sheet connector), lock.js (Import ทีละรายการ), activity.js (ประวัติการใช้งาน), checker.js, barcode.js (ทำความสะอาดเลขบาร์โค้ด), appauth.js (login ของแอป Android), parse.js (อ่าน Excel/CSV), db.js, i18n.js / i18n-zh.js (คำแปล EN / 繁體中文)
views/      หน้าเว็บ (EJS)
public/     CSS
sql/        schema.sql (ติดตั้งใหม่), migrate-*.sql (อัปเกรดฐานข้อมูลเดิม)
android/    แอป Android (Checker) + build.sh
deploy/     install.sh (ติดตั้งครั้งแรก), update.sh (อัปเดต + backup), packing.service, nginx-packing.conf
```

## ติดตั้งครั้งแรก (Ubuntu 24.04, รันเป็น root)
```bash
git clone https://github.com/RNPPawungS/RNPChecker.git /opt/packing-src
bash /opt/packing-src/deploy/install.sh
ln -sf /opt/packing-src/deploy/pull-update.sh /usr/local/bin/packing-update
nano /opt/packing/.env          # ใส่ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
systemctl restart packing
```
สคริปต์จะติดตั้ง Nginx, MySQL, Node.js 22 สร้างฐานข้อมูลและไฟล์ `.env` (สุ่มรหัสผ่าน DB / session secret ให้) และใบรับรอง HTTPS แบบ self-signed

Google OAuth redirect URI: `https://packing.rnpexpress.co.th/auth/google/callback`

## อัปเดตเวอร์ชันจาก GitHub
บนเซิร์ฟเวอร์มีโค้ดจาก repo นี้อยู่ที่ `/opt/packing-src` (git clone) ส่วนเว็บที่รันจริงอยู่ที่ `/opt/packing`
```bash
packing-update --check   # ดูว่ามี commit ใหม่บน GitHub หรือไม่ (ยังไม่อัปเดต)
packing-update           # ดึงโค้ดล่าสุดจาก branch main แล้วอัปเดตเว็บ
```
`packing-update` (= `deploy/pull-update.sh`) จะ `git pull` แล้วเรียก `deploy/update.sh` ซึ่งสำรองโค้ดและ mysqldump ไว้ที่ `/root/packing-backup-<เวลา>` คัดลอกโค้ดใหม่ (ไม่แตะ `.env`) รัน migration ที่ยังไม่ได้ลง แล้วรีสตาร์ท และบันทึก commit ที่ลงไว้ใน `/opt/packing/REVISION`

ตั้งค่าครั้งแรกบนเซิร์ฟเวอร์ที่ติดตั้งไว้แล้ว:
```bash
apt-get install -y git
git clone https://github.com/RNPPawungS/RNPChecker.git /opt/packing-src
ln -sf /opt/packing-src/deploy/pull-update.sh /usr/local/bin/packing-update
packing-update
```
ถ้าภายหลังเปลี่ยน repo เป็น private ต้องเพิ่ม deploy key (read-only) ให้เซิร์ฟเวอร์ แล้วเปลี่ยน remote เป็น `git@github.com:RNPPawungS/RNPChecker.git`

## เชื่อม Google Sheet (ตั้งค่าครั้งเดียว)
ต้องมีหัวคอลัมน์ `DATE`, `CTN NO.`, `AWB`, `flag_upload` ในแถวแรกของ sheet `DATA` (ตำแหน่งคอลัมน์ไม่สำคัญ)

1. **สร้าง service account** ที่ [Google Cloud Console](https://console.cloud.google.com/) (ใช้ project เดียวกับ Google OAuth ของเว็บได้)
   - APIs & Services → Library → เปิด **Google Sheets API**
   - IAM & Admin → Service Accounts → Create service account (ตั้งชื่อเช่น `packing-sheet` ไม่ต้องให้ role)
   - เข้า service account นั้น → Keys → Add key → Create new key → JSON จะได้ไฟล์ .json มา 1 ไฟล์ (เก็บเป็นความลับ)
2. **แชร์ Google Sheet** ให้ email ของ service account (เช่น `packing-sheet@<project>.iam.gserviceaccount.com`) เป็น **Editor** (ต้องเป็น Editor เพื่อเขียน `flag_upload`; ถ้าองค์กรห้ามแชร์ออกนอกโดเมน ให้ admin ของ Google Workspace อนุญาตก่อน)
3. **ใส่ไฟล์ key บนเซิร์ฟเวอร์** แล้วตั้งค่า `.env`
   ```bash
   # คัดลอกไฟล์ .json ขึ้นเซิร์ฟเวอร์ (เช่น scp) แล้ว
   mv <ไฟล์>.json /opt/packing/google-service-account.json
   chown packing:packing /opt/packing/google-service-account.json && chmod 600 /opt/packing/google-service-account.json
   nano /opt/packing/.env
   #   GOOGLE_SHEET_ID=13S5QiATVXvOyoVg_5N57oheQjAEuhZU_2DLGeAl1Ay0
   #   GOOGLE_SHEET_TAB=DATA
   #   GOOGLE_SERVICE_ACCOUNT_FILE=/opt/packing/google-service-account.json
   systemctl restart packing
   journalctl -u packing -n 20 --no-pager   # ต้องเห็น "google sheet connector: tab "DATA", every 60s"
   ```
4. เปิดหน้า **ประวัติ Import** ดูการ์ด "Google Sheet Connector" (ตรวจล่าสุด / Import ล่าสุด / ข้อผิดพลาด)

ครั้งแรกจะ Import ทุกแถวที่ยังไม่มี `true` ใน `flag_upload` (Waybill ที่มีอยู่แล้วจะเป็น "ไม่เปลี่ยนแปลง" หรือ "อัปเดต") ถ้าไม่ต้องการข้อมูลเก่า ให้ใส่ `true` ใน `flag_upload` ของแถวเก่าก่อน หรือตั้ง `SHEET_START_ROW` เป็นแถวที่ต้องการเริ่ม
ไฟล์ key อยู่นอกโฟลเดอร์โค้ด `packing-update` จึงไม่ลบหรือเขียนทับ

## ตั้งค่า (`.env`)
ดู `.env.example` ห้าม commit ไฟล์ `.env` จริงขึ้น repo

## ดูแลระบบ
- สถานะ: `systemctl status packing` · log: `journalctl -u packing -f`
- ย้อนเวอร์ชัน: `cp -a /root/packing-backup-<เวลา>/{src,views,public,package.json} /opt/packing/ && systemctl restart packing`
