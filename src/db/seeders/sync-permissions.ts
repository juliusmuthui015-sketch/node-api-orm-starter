import { initDatabase } from '@/config/db.config';
import Role from '@/server/Models/User/Role';
import Permission from '@/server/Models/User/Permission';

interface PermissionDef { slug: string; name: string; description?: string }

// Central permission registry. Keep this in sync with routes' authorizePermissions() calls.
const PERMISSIONS: PermissionDef[] = [
  // Users
  { slug: 'view_users', name: 'View Users', description: 'Can list and view user records' },
  { slug: 'create_users', name: 'Create Users', description: 'Can create new users' },
  { slug: 'update_users', name: 'Update Users', description: 'Can update existing users' },
  { slug: 'delete_users', name: 'Delete Users', description: 'Can delete users' },

  // Roles
  { slug: 'view_roles', name: 'View Roles', description: 'Can list and view roles' },
  { slug: 'create_roles', name: 'Create Roles', description: 'Can create roles' },
  { slug: 'update_roles', name: 'Update Roles', description: 'Can update roles' },
  { slug: 'delete_roles', name: 'Delete Roles', description: 'Can delete roles' },
  { slug: 'add_permissions_to_roles', name: 'Add Permissions to Roles', description: 'Can attach/detach permissions for a role' },

  // Permissions
  { slug: 'view_permissions', name: 'View Permissions', description: 'Can list and view permissions' },
  { slug: 'create_permissions', name: 'Create Permissions', description: 'Can create new permissions' },
  { slug: 'update_permissions', name: 'Update Permissions', description: 'Can update permissions' },
  { slug: 'delete_permissions', name: 'Delete Permissions', description: 'Can delete permissions' }
];

async function ensureAdminRole(): Promise<Role> {
  const now = new Date();
  let role = await Role.where('slug', 'admin').first();
  if (!role) {
    role = await Role.create({ name: 'Admin', slug: 'admin', description: 'Administrator role', created_at: now, updated_at: now });
  }
  return role;
}

async function upsertPermissions(): Promise<Permission[]> {
  const now = new Date();
  const result: Permission[] = [];
  for (const p of PERMISSIONS) {
    let perm = await Permission.where('slug', p.slug).first();
    if (perm) {
      await perm.update({ name: p.name, description: p.description || '', updated_at: now });
      result.push(perm);
    } else {
      const created = await Permission.create({ name: p.name, slug: p.slug, description: p.description || '', created_at: now, updated_at: now });
      result.push(created as Permission);
    }
  }
  return result;
}

async function attachAllToAdmin(role: Role, perms: Permission[]) {
  const permIds = perms.map(p => (p as any).id as number).filter(Boolean);
  if (!permIds.length) return;
  try {
    await (role as any).permissions().sync(permIds);
  } catch (e) {
    await (role as any).permissions().attach(permIds);
  }
}

async function run() {
  await initDatabase();
  const role = await ensureAdminRole();
  const perms = await upsertPermissions();
  await attachAllToAdmin(role, perms);
  console.log(`Synced ${perms.length} permissions and attached to admin role (id=${(role as any).id}).`);
}

run().catch(err => { console.error('Permission sync failed:', err); process.exit(1); });
