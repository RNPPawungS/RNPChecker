# RNP Checker (packing)

เว็บแอปจัดการและตรวจสอบข้อมูลกล่องพัสดุ ใช้งานที่ `https://packing.rnpexpress.co.th` (ภายในองค์กร)

**Stack:** Node.js 22 (Express + EJS) · MySQL 8 · Nginx · Google OAuth

## ฟีเจอร์
- **Login ด้วย Google** ใช้บัญชี Google ใดก็ได้ ผู้ใช้คนแรกเป็น admin ส่วนผู้ใช้ใหม่ต้องรอ admin อนุมัติ (เมนู "ผู้ใช้งาน")
  - admin เพิ่มผู้ใช้ล่วงหน้าด้วย email ได้ (เข้าสู่ระบบด้วย Google ของ email นั้นได้ทันทีไม่ต้องรออนุมัติ) และลบผู้ใช้ได้ ผู้ใช้ที่ลบจะเข้าเว็บและแอปไม่ได้ แต่ประวัติการอัปโหลด / การตรวจยังแสดง email เดิม ถ้ากลับมา login ใหม่ต้องรออนุมัติอีกครั้ง
- **จัดการข้อมูล** Box No. / Waybill No. / Operation Date ค้นหา กรองช่วงวันที่ (dd/mm/yyyy) เพิ่ม แก้ไข ลบ ส่งออก Excel
- **อัปโหลด** ดาวน์โหลด template (.xlsx) อัปโหลด .xlsx / .csv ถ้า Waybill ซ้ำจะอัปเดตทับ มีหน้าผลการ import รายแถว (เพิ่มใหม่ / อัปเดต / ไม่เปลี่ยนแปลง / ผิดพลาด พร้อมค่าก่อน-หลัง) และดาวน์โหลดผลเป็น Excel ได้
- **Checker** (รองรับเครื่องยิงบาร์โค้ด)
  - *Ref Check* ใส่ Waybill No. จะได้ Box No. ใส่ Box No. จะได้รายการ Waybill
  - *Cross Ref Check* ตรวจคู่ Waybill/Box เลือกลำดับได้ แสดงผลตรง/ไม่ตรงชัดเจนพร้อมเสียง
  - เลือก Operation Date (ค่าเริ่มต้นวันนี้) แล้วค้นหาเฉพาะวันนั้น ทำความสะอาดเลขที่ยิงมาให้อัตโนมัติ (ดู [src/barcode.js](src/barcode.js)): ตัด `*` (Code 39), `^` หน้า/ท้าย, ตัวอักษร start/stop ของ Codabar A-D / T N E (เช่น `D3867497060D` → `3867497060`), รหัสชนิดบาร์โค้ด AIM เช่น `]C0` `]F0`, อักขระควบคุม (STX/ETX, GS/FNC1, Enter, Tab) และแปลงตัวอักษรที่พิมพ์ผิดเพราะคีย์บอร์ดเป็นภาษาไทย ใช้กับแอป Android, หน้าข้อมูล (ค้นหา/เพิ่ม) และไฟล์ที่อัปโหลดด้วย โดยไม่ต้องอัปเดตแอป มีบันทึกประวัติการตรวจ

- **2 ภาษา ไทย / English** สลับด้วยปุ่มธงชาติมุมขวาบน (ค่าเริ่มต้นภาษาไทย ระบบจำภาษาที่เลือกไว้ในเบราว์เซอร์ 1 ปี) คำแปลอยู่ใน `src/i18n.js` ข้อความในหน้าเว็บเขียนเป็นภาษาไทยแล้วครอบด้วย `t('...')`
- **แอป Android (Checker)** สำหรับเครื่อง handheld ดาวน์โหลดและจับคู่เครื่องได้ที่เมนู "แอป Android (Checker)" รายละเอียดใน [android/README.md](android/README.md)

## โครงสร้าง
```
src/        app.js (routes หลัก), imports.js (อัปโหลด), checker.js, barcode.js (ทำความสะอาดเลขบาร์โค้ด), appauth.js (login ของแอป Android), parse.js (อ่าน Excel/CSV), db.js, i18n.js (คำแปล TH/EN)
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

## ตั้งค่า (`.env`)
ดู `.env.example` ห้าม commit ไฟล์ `.env` จริงขึ้น repo

## ดูแลระบบ
- สถานะ: `systemctl status packing` · log: `journalctl -u packing -f`
- ย้อนเวอร์ชัน: `cp -a /root/packing-backup-<เวลา>/{src,views,public,package.json} /opt/packing/ && systemctl restart packing`
