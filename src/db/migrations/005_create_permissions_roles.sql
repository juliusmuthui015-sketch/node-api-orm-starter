CREATE TABLE IF NOT EXISTS permissions_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  permissions_id INT NOT NULL,
  roles_id INT NOT NULL,
  UNIQUE KEY unique_perm_role (permissions_id, roles_id),
  INDEX idx_pr_perm (permissions_id),
  INDEX idx_pr_role (roles_id),
  CONSTRAINT fk_pr_perm FOREIGN KEY (permissions_id) REFERENCES permissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_role FOREIGN KEY (roles_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

