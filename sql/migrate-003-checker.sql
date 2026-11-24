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
