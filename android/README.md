# RNP Checker (Android)

แอป Android สำหรับเครื่อง handheld ใช้งานเฉพาะ **Checker** (Ref Check / Cross Ref Check) ของเว็บ Packing

- UI แบบ native (ไม่มี WebView) ขนาด APK ~80 KB เปิดเร็ว ยิงต่อเนื่องได้ทันทีโดยไม่ต้องรอผล
- รองรับเครื่องยิง: **keyboard wedge** (Enter / Tab / ขึ้นบรรทัดใหม่) และ **broadcast intent** ของ Zebra DataWedge (ตั้งโปรไฟล์ให้อัตโนมัติ), Honeywell, Urovo, iData, Chainway, Newland, Sunmi, Seuic
- ซ่อนคีย์บอร์ดบนจอเป็นค่าเริ่มต้น (ปุ่ม `Aa` เปิดเมื่อต้องพิมพ์เอง) ตัด `*` (Code 39) และแก้ตัวอักษรที่ยิงผ่านคีย์บอร์ดภาษาไทยให้อัตโนมัติ
- แจ้งผลด้วยสีเต็มจอ กรอบกระพริบเมื่อไม่ตรง/ไม่พบ เสียง และการสั่น พร้อมประวัติการตรวจวันนี้
- เลือก Operation Date (ค่าเริ่มต้นวันนี้) การค้นหาทุกครั้งจะดูเฉพาะวันที่เลือก
- Ref Check แสดงคำตอบตัวใหญ่ (ยิง Waybill → Box No., ยิง Box → Waybill No.)
- Android 5.0 ขึ้นไป (minSdk 21, targetSdk 34)

## เข้าสู่ระบบ
แอปไม่ใช้ Google login ในเครื่องโดยตรง ให้เปิดเว็บบนคอมพิวเตอร์ → เมนู **แอป Android (Checker)** (`/app/pair`) แล้วยิง QR ด้วยเครื่อง handheld
(QR มีอายุ 10 นาที, token ของแอปมีอายุ 180 วัน, ระงับผู้ใช้ในเมนู "ผู้ใช้งาน" แล้วแอปจะใช้ไม่ได้ทันที)
ทางเลือก: ปุ่ม "เข้าสู่ระบบด้วย Google ผ่านเบราว์เซอร์" ในแอป (`/app/login`)

เซิร์ฟเวอร์ใช้ใบรับรองแบบ self-signed แอปจะแสดง SHA-256 ให้กด "เชื่อถือ" ครั้งแรกครั้งเดียว
เซิร์ฟเวอร์เริ่มต้นของแอปคือ `https://10.80.0.9` (เปลี่ยนได้ที่เมนู ⋮)

## Build
ไม่ต้องใช้ Android Studio / Gradle ใช้แพ็กเกจของ Ubuntu:
```bash
sudo apt-get install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner default-jdk
KEYSTORE=/path/rnp-checker-release.jks KS_ALIAS=rnpchecker KS_PASS=... android/build.sh
cp android/build/rnp-checker.apk public/app/rnp-checker.apk   # ให้เว็บแจก APK ที่ /app/download
```
ต้องใช้ keystore เดิมทุกครั้งที่ออกเวอร์ชันใหม่ (ไม่อย่างนั้นเครื่องต้องถอนแอปก่อนติดตั้ง) และเพิ่ม `versionCode` ใน `AndroidManifest.xml` + `VERSION` ใน `BuildInfo.java`
ห้าม commit keystore ขึ้น repo
