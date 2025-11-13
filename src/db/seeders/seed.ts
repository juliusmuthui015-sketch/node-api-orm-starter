import bcrypt from 'bcrypt';
import { query, initDatabase } from '../../config/db.config';

async function seed() {
  await initDatabase();
  const now = new Date();
  // Roles
  await query(`INSERT IGNORE INTO roles (id,name,slug,description,created_at,updated_at) VALUES 
    (1,'Admin','admin','Administrator role',?,?),
    (2,'User','user','Regular user',?,?)`, [now, now, now, now]);
  // Permissions
  await query(`INSERT IGNORE INTO permissions (id,name,slug,description,created_at,updated_at) VALUES 
    (1,'View Users','view_users','',?,?),
    (2,'Manage Users','manage_users','',?,?),
    (3,'View Roles','view_roles','',?,?),
    (4,'Manage Roles','manage_roles','',?,?),
    (5,'View Permissions','view_permissions','',?,?),
    (6,'Manage Permissions','manage_permissions','',?,?)`, [now, now, now, now, now, now, now, now, now, now, now, now]);
  // Admin user
  const pass = await bcrypt.hash('password', 10);
  await query(`INSERT IGNORE INTO users (id,name,email,password,active_status,created_at,updated_at) VALUES 
    (1,'Admin','admin@example.com',?,1,?,?)`, [pass, now, now]);
  // roles_users pivot
  await query(`INSERT IGNORE INTO roles_users (roles_id, users_id) VALUES (1,1)`);
  // permissions_roles pivot (attach all permissions to admin role)
  await query(`INSERT IGNORE INTO permissions_roles (permissions_id, roles_id)
    SELECT p.id, 1 FROM permissions p`);

  console.log('Seeding complete');
}

seed().catch(err => { console.error(err); process.exit(1); });