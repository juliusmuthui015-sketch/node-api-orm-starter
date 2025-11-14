import bcrypt from 'bcrypt';
import { initDatabase } from '@/config/db.config';
import Role from "@/server/Models/User/Role";
import Permission from "@/server/Models/User/Permission";
import User from "@/server/Models/User/User";
import {EUserType} from "@/server/enums";

export async function seed() {
  await initDatabase();
  const now = new Date();

  // Ensure roles exist (create or get)
  let adminRole = await Role.where('slug', 'admin').first();
  if (!adminRole) {
    adminRole = await Role.create({ name: 'Admin', slug: 'admin', description: 'Administrator role', created_at: now, updated_at: now });
  }

  const existingUserRole = await Role.where('slug', 'user').first();
  if (!existingUserRole) {
    await Role.create({ name: 'User', slug: 'user', description: 'Regular user', created_at: now, updated_at: now });
  }

  // Permissions: upsert from registry
  const PERMISSIONS: Array<{ slug: string; name: string; description?: string }> = [
    { slug: 'view_users', name: 'View Users' },
    { slug: 'manage_users', name: 'Manage Users' },
    { slug: 'view_roles', name: 'View Roles' },
    { slug: 'manage_roles', name: 'Manage Roles' },
    { slug: 'view_permissions', name: 'View Permissions' },
    { slug: 'manage_permissions', name: 'Manage Permissions' }
  ];

  const permIds: number[] = [];
  for (const p of PERMISSIONS) {
    let existing = await Permission.where('slug', p.slug).first();
    if (existing) {
      await existing.update({ name: p.name, description: p.description || '', updated_at: now });
      permIds.push(existing.id as number);
    } else {
      const created = await Permission.create({ name: p.name, slug: p.slug, description: p.description || '', created_at: now, updated_at: now });
      permIds.push((created as any).id as number);
    }
  }

  // Ensure admin user exists
  let admin = await User.where('email', 'admin@example.com').first();
  if (!admin) {
    admin = await User.create({ name: 'Admin', email: 'admin@example.com', password: await bcrypt.hash('password', 10), active_status: 1, created_at: now, updated_at: now });
    await admin.profile().create({ user_id: admin.id as number, gender: 'male', type: 'admin', created_at: now, updated_at: now });
  }

  // Ensure regular user exists
  let existingUser = await User.where('email', 'user@example.com').first();
  if (!existingUser) {
    existingUser = await User.create({ name: 'User', email: 'user@example.com', password: await bcrypt.hash('password', 10), active_status: 1, created_at: now, updated_at: now });
    await existingUser.profile().create({ user_id: existingUser.id as number, gender: 'male', type: EUserType.TENANT, created_at: now, updated_at: now });
  }

  // Attach admin role to admin user
  try {
    await (admin as any).roles().sync([adminRole.id as number]);
  } catch (e) {
    // fallback to attach if sync not supported in this environment
    await (admin as any).roles().attach(adminRole.id as number);
  }

  // Attach all permissions to admin role
  try {
    await (adminRole as any).permissions().sync(permIds);
  } catch (e) {
    await (adminRole as any).permissions().attach(permIds);
  }

  console.log('Seeding complete');
}

// When run directly, execute the seeder
if (require.main === module) {
  seed().catch(err => { console.error(err); process.exit(1); });
}

export default seed;
