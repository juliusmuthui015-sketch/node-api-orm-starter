CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  email_verified_at DATETIME NULL,
  password VARCHAR(255) NOT NULL,
  active TINYINT(1) NULL,
  last_login DATETIME NULL,
  last_seen_at DATETIME NULL,
  last_login_ip VARCHAR(64) NULL,
  default_role_id INT NULL,
  remember_token VARCHAR(100) NULL,
  active_status TINYINT(1) DEFAULT 0,
  avatar VARCHAR(191) NULL,
  dark_mode TINYINT(1) DEFAULT 0,
  messenger_color VARCHAR(32) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  deleted_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

