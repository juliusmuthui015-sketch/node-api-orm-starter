import { query, initDatabase } from '../../config/db.config';

interface PermissionDef { slug: string; name: string; description?: string }

// Central permission registry. Extend here to add new permissions.
const PERMISSIONS: PermissionDef[] = [
  { slug: 'view_users', name: 'View Users' },
  { slug: 'manage_users', name: 'Manage Users' },
  { slug: 'view_roles', name: 'View Roles' },
  { slug: 'manage_roles', name: 'Manage Roles' },
  { slug: 'view_permissions', name: 'View Permissions' },
  { slug: 'manage_permissions', name: 'Manage Permissions' }
];

async function ensureAdminRole(): Promise<number> {
  const now = new Date();
  // Try fetch admin role
  const roleRows = await query<any>(`SELECT id FROM roles WHERE slug = 'admin' LIMIT 1`);
  if (roleRows.length) return roleRows[0].id;
  const result: any = await query<any>(
    `INSERT INTO roles (name, slug, description, created_at, updated_at) VALUES ('Admin','admin','Administrator role', ?, ?)`,
    [now, now]
  );
  return result.insertId || (await query<any>(`SELECT id FROM roles WHERE slug='admin' LIMIT 1`))[0].id;
}

async function upsertPermissions(): Promise<number[]> {
  const now = new Date();
  const ids: number[] = [];
  for (const p of PERMISSIONS) {
    // Try update existing
    const existing = await query<any>(`SELECT id FROM permissions WHERE slug = ? LIMIT 1`, [p.slug]);
    if (existing.length) {
      await query(`UPDATE permissions SET name = ?, description = ?, updated_at = ? WHERE id = ?`, [p.name, p.description || '', now, existing[0].id]);
      ids.push(existing[0].id);
    } else {
      const insert: any = await query<any>(`INSERT INTO permissions (name, slug, description, created_at, updated_at) VALUES (?,?,?,?,?)`, [p.name, p.slug, p.description || '', now, now]);
      const newId = insert.insertId || (await query<any>(`SELECT id FROM permissions WHERE slug = ? LIMIT 1`, [p.slug]))[0].id;
      ids.push(newId);
    }
  }
  return ids;
}

async function attachAllToAdmin(roleId: number, permIds: number[]) {
  // Clear existing pivot rows for role
  await query(`DELETE FROM permissions_roles WHERE roles_id = ?`, [roleId]);
  if (!permIds.length) return;
  const values = permIds.map(() => '(?, ?)').join(',');
  const params: any[] = [];
  permIds.forEach(id => { params.push(id, roleId); });
  await query(`INSERT INTO permissions_roles (permissions_id, roles_id) VALUES ${values}`, params);
}

async function run() {
  await initDatabase();
  const roleId = await ensureAdminRole();
  const permIds = await upsertPermissions();
  await attachAllToAdmin(roleId, permIds);
  console.log(`Synced ${permIds.length} permissions and attached to admin role (id=${roleId}).`);
}

run().catch(err => { console.error('Permission sync failed:', err); process.exit(1); });

