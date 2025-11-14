import { ModelAttributes } from '@/eloquent/types';
import {TRequest} from "@/server/types/types";
import User from "@/server/Models/User/User";
import UserProfile from '@/server/Models/User/UserProfile';

export class UserService {
  async list(request: TRequest) {
      const {query} = request;
      let users = User.query();
      if (query.search) {
         users.where('name', 'like', `%${query.search}%`)
            .orWhere('email', 'like', `%${query.search}%`)
            .orWhere('phone_number', 'like', `%${query.search}%`);
      }
      if (query.sort) {
        users.orderBy(query.sort, query.order || 'asc');
      }

      return await users.with(['profile','roles', 'roles.permissions']).paginate(query.limit, query.page);
  }
  async find(id: number|string) {
      return await User.with(['profile','roles', 'roles.permissions']).findOrFail(id);
  }
  async create(data: ModelAttributes) {
      let user = User.query();
      user.where('email', '=', data.email).orWhere('phone_number', '=', data.phone_number);
      if (await user.first()) throw new Error('User already exists');

      return User.create(data);
  }
  async update(id: number|string, data: ModelAttributes) {
    const user = await User.find(id);
    if(!user) return null;
    await (user as any).update(data);
    return user;
  }
  async delete(id: number|string) {
    const user = await User.find(id);
    if(!user) return false;
    await (user as any).delete();
    return true;
  }
  async getProfile(userId: number|string) {
      // try to load profile via relation
      try {
        const user = await User.with(['profile']).find(userId);
        if (!user) return null;
        return (user as any).profile || null;
      } catch (e) {
        return null;
      }
  }

  async updateProfile(userId: number|string, data: ModelAttributes) {
    // ensure user exists
    const user = await User.find(userId);
    if (!user) return null;
    // find existing profile
    let profile = await UserProfile.where('user_id', '=', userId).first();
    if (profile) {
      await (profile as any).update(data);
      return profile;
    }
    // create new profile
    const attrs = { ...data, user_id: userId } as any;
    return await UserProfile.create(attrs);
   }

   async setPassword(userId: number|string, hashedPassword: string) {
    const user = await User.find(userId);
    if (!user) return null;
    await (user as any).update({ password: hashedPassword });
    return user;
  }
}

export default new UserService();
