import { ModelAttributes } from '@/eloquent/types';
import { TProfile, TRequest } from '@/app/Http/types';
import User from '@/app/Models/User/User';
import UserProfile from '@/app/Models/User/UserProfile';
import Role from '@/app/Models/User/Role';
import { RolesUsers } from '@/app/Models/User/RolesUsers';

export class UserService {
  async list(request: TRequest) {
    const { query } = request;
    let users = User.query().with(['profile', 'roles', 'roles.permissions']);
    if (query.search) {
      users
        .where('name', 'like', `%${query.search}%`)
        .orWhere('email', 'like', `%${query.search}%`)
        .orWhere('phone_number', 'like', `%${query.search}%`);
    }
    if (query.sort) {
      users.orderBy(query.sort, query.order || 'asc');
    }
    if (query.deleted) {
      users.onlyTrashed();
    }
    if (query.role) {
      users = users.whereHas('roles', (builder) => {
        builder
          .where('id', '=', query.role)
          .orWhere('name', '=', query.role)
          .orWhere('slug', '=', query.role);
      });
    }
    if (query.type) {
      users = users.whereHas('profile', (query_) => {
        query_.where('type', '=', query.type);
      });
    }
    // no landlord-restrictions in starter template
    return await users.paginate(query.limit, query.page);
  }
  async find(id: number | string) {
    return await User.with(['profile', 'roles', 'roles.permissions']).findOrFail(id);
  }
  async create(data: ModelAttributes): Promise<User> {
    let user = User.query();
    user.where('email', '=', data.email).orWhere('phone_number', '=', data.phone_number);
    if (await user.first()) throw new Error('User already exists');

    return User.create(data);
  }
  async update(id: number | string, data: ModelAttributes) {
    const user = await User.find(id);
    if (!user) return null;
    await (user as any).update(data);
    return user;
  }
  async delete(id: number | string) {
    const user = await User.find(id);
    if (!user) return false;
    await user.delete();
    return true;
  }
  async getProfile(userId: number | string) {
    // try to load profile via relation
    try {
      const user = await User.with([
        'profile',
        'profile.user',
        'profile.user.roles',
        'profile.user.roles.permissions',
      ]).find(userId);
      if (!user) return null;
      return (user.toJSON() as any).profile || null;
    } catch (e) {
      return null;
    }
  }

  async updateProfile(userId: number | string, data: TProfile) {
    // ensure user exists
    const user = await User.find(userId);
    if (!user) return null;
    // find existing profile
    let profile = await UserProfile.where('user_id', '=', userId).first();
    // keep role assignment for agent/caretaker, but remove landlord/tenant auto assignment
    if (profile?.type !== data.type) {
      if (data.type === 'agent' || data.type === 'caretaker') {
        const roleSlug = data.type;
        const role = await Role.query().where('slug', roleSlug).first();
        if (role) await user.roles().attach(role.id as any);
      }
    }
    if (profile) {
      await (profile as any).update(data);
      return profile;
    }
    // create new profile
    const attrs = { ...data, user_id: userId } as any;
    return await UserProfile.create(attrs);
  }

  async setPassword(userId: number | string, hashedPassword: string) {
    const user = await User.find(userId);
    if (!user) return null;
    await (user as any).update({ password: hashedPassword });
    return user;
  }

  async removeRole(userId: number | string, roleId: number | string) {
    const user = await User.find(userId);
    if (!user) return null;
    // remove pivot using model
    await RolesUsers.query().where('roles_id', roleId).where('users_id', userId).delete();
    // reload user with roles
    return await User.with(['profile', 'roles', 'roles.permissions']).find(userId);
  }
  async addRole(userId: number | string, roleId: number | string) {
    let user = await User.find(userId);
    if (!user) return null;
    const role = await Role.find(roleId);
    if (!role) throw new Error('Role not found');
    // check existing
    const existing = await RolesUsers.query()
      .where('users_id', userId)
      .where('roles_id', roleId)
      .exists();
    if (!existing) {
      await RolesUsers.create({ users_id: userId, roles_id: roleId });
    }
    return await User.with(['profile', 'roles', 'roles.permissions']).find(userId);
  }
}

export default new UserService();
