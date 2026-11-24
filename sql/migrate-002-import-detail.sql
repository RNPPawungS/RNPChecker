-- รายละเอียดผลการ import ทีละแถว
ALTER TABLE uploads
  ADD COLUMN unchanged_rows INT NOT NULL DEFAULT 0 AFTER updated_rows,
  ADD COLUMN status ENUM('processing','done','failed') NOT NULL DEFAULT 'done' AFTER error_rows,
  ADD COLUMN message VARCHAR(500) NULL AFTER status,
  ADD COLUMN file_size INT NULL AFTER filename,
  ADD COLUMN duration_ms INT NULL AFTER message;

CREATE TABLE IF NOT EXISTS upload_rows (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  upload_id INT NOT NULL,
  line_no INT NOT NULL,
  box_no VARCHAR(64),
  waybill_no VARCHAR(64),
  operation_date DATE NULL,
  raw_date VARCHAR(64) NULL,
  status ENUM('inserted','updated','unchanged','error') NOT NULL,
  message VARCHAR(500) NULL,
  old_box_no VARCHAR(64) NULL,
  old_operation_date DATE NULL,
  INDEX idx_upload_status (upload_id, status),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
