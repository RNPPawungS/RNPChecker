-- ผู้ใช้ที่ admin เพิ่มด้วย email ยังไม่มี google_id จนกว่าจะเข้าสู่ระบบครั้งแรก
-- ผู้ใช้ที่ถูกลบ (deleted_at) ยังเก็บแถวไว้ เพื่อให้ประวัติอัปโหลด / การตรวจ ยังแสดง email ได้
ALTER TABLE users
  MODIFY google_id VARCHAR(64) NULL,
  ADD COLUMN deleted_at TIMESTAMP NULL AFTER last_login_at,
  ADD INDEX idx_email (email);
