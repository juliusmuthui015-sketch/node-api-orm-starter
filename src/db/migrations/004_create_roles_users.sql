CREATE TABLE IF NOT EXISTS roles_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roles_id INT NOT NULL,
  users_id INT NOT NULL,
  UNIQUE KEY unique_role_user (roles_id, users_id),
  INDEX idx_ru_role (roles_id),
  INDEX idx_ru_user (users_id),
  CONSTRAINT fk_ru_role FOREIGN KEY (roles_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ru_user FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

