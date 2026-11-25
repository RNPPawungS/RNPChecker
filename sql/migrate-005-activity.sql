-- ประวัติการใช้งาน (เมนูสำหรับผู้ดูแลระบบ): ใครทำอะไร เมื่อไร
-- เก็บ email ไว้ในแถวด้วย เพราะผู้ใช้ที่ไม่เคยเข้าสู่ระบบถูกลบออกจากตาราง users ได้
-- การตรวจของ Checker อยู่ใน check_logs อยู่แล้ว (หน้าประวัติการใช้งานแสดงรวมกัน)
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  email VARCHAR(255) NULL,
  action VARCHAR(32) NOT NULL,
  meta TEXT NULL,
  ref VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_user (user_id, created_at),
  INDEX idx_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
