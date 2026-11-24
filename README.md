# RNP Checker (packing)

เว็บแอปจัดการและตรวจสอบข้อมูลกล่องพัสดุ ใช้งานที่ `https://packing.rnpexpress.co.th` (ภายในองค์กร)

**Stack:** Node.js 22 (Express + EJS) · MySQL 8 · Nginx · Google OAuth

## ฟีเจอร์
- **Login ด้วย Google** ใช้บัญชี Google ใดก็ได้ ผู้ใช้คนแรกเป็น admin ส่วนผู้ใช้ใหม่ต้องรอ admin อนุมัติ (เมนู "ผู้ใช้งาน")
- **จัดการข้อมูล** Box No. / Waybill No. / Operation Date ค้นหา กรองช่วงวันที่ (dd/mm/yyyy) เพิ่ม แก้ไข ลบ ส่งออก Excel
- **อัปโหลด** ดาวน์โหลด template (.xlsx) อัปโหลด .xlsx / .csv ถ้า Waybill ซ้ำจะอัปเดตทับ มีหน้าผลการ import รายแถว (เพิ่มใหม่ / อัปเดต / ไม่เปลี่ยนแปลง / ผิดพลาด พร้อมค่าก่อน-หลัง) และดาวน์โหลดผลเป็น Excel ได้
- **Checker** (รองรับเครื่องยิงบาร์โค้ด)
  - *Ref Check* ใส่ Waybill No. จะได้ Box No. ใส่ Box No. จะได้รายการ Waybill
  - *Cross Ref Check* ตรวจคู่ Waybill/Box เลือกลำดับได้ แสดงผลตรง/ไม่ตรงชัดเจนพร้อมเสียง
  - ตัด `*` (Code 39) และแปลงตัวอักษรที่พิมพ์ผิดเพราะคีย์บอร์ดเป็นภาษาไทยให้อัตโนมัติ มีบันทึกประวัติการตรวจ

## โครงสร้าง
```
src/        app.js (routes หลัก), imports.js (อัปโหลด), checker.js, parse.js (อ่าน Excel/CSV), db.js
views/      หน้าเว็บ (EJS)
public/     CSS
sql/        schema.sql (ติดตั้งใหม่), migrate-*.sql (อัปเกรดฐานข้อมูลเดิม)
deploy/     install.sh (ติดตั้งครั้งแรก), update.sh (อัปเดต + backup), packing.service, nginx-packing.conf
```

## ติดตั้งครั้งแรก (Ubuntu 24.04, รันเป็น root)
```bash
git clone https://github.com/RNPPawungS/RNPChecker.git /root/packing
bash /root/packing/deploy/install.sh
nano /opt/packing/.env          # ใส่ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
systemctl restart packing
```
สคริปต์จะติดตั้ง Nginx, MySQL, Node.js 22 สร้างฐานข้อมูลและไฟล์ `.env` (สุ่มรหัสผ่าน DB / session secret ให้) และใบรับรอง HTTPS แบบ self-signed

Google OAuth redirect URI: `https://packing.rnpexpress.co.th/auth/google/callback`

## อัปเดตเวอร์ชัน
```bash
cd /root/packing && git pull
bash deploy/update.sh
```
`update.sh` จะสำรองโค้ดและ mysqldump ไว้ที่ `/root/packing-backup-<เวลา>` คัดลอกโค้ดใหม่ (ไม่แตะ `.env`) รัน migration ที่ยังไม่ได้ลง แล้วรีสตาร์ท

## ตั้งค่า (`.env`)
ดู `.env.example` ห้าม commit ไฟล์ `.env` จริงขึ้น repo

## ดูแลระบบ
- สถานะ: `systemctl status packing` · log: `journalctl -u packing -f`
- ย้อนเวอร์ชัน: `cp -a /root/packing-backup-<เวลา>/{src,views,public,package.json} /opt/packing/ && systemctl restart packing`
