CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  status ENUM('pending','active','disabled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_size INT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  inserted_rows INT NOT NULL DEFAULT 0,
  updated_rows INT NOT NULL DEFAULT 0,
  unchanged_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  status ENUM('processing','done','failed') NOT NULL DEFAULT 'done',
  message VARCHAR(500) NULL,
  duration_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS packings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  box_no VARCHAR(64) NOT NULL,
  waybill_no VARCHAR(64) NOT NULL UNIQUE,
  operation_date DATE NOT NULL,
  upload_id INT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_box (box_no),
  INDEX idx_date (operation_date),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
CREATE TABLE IF NOT EXISTS check_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mode ENUM('ref','cross') NOT NULL,
  check_order ENUM('wb','bw') NULL,
  input1 VARCHAR(64) NOT NULL,
  input2 VARCHAR(64) NULL,
  result ENUM('found','match','mismatch','not_found') NOT NULL,
  detail VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
