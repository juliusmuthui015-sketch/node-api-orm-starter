
import { ModelAttributes } from '@/eloquent/types';
import {TRequest} from "@/server/types/types";
import User from "@/server/Models/User/User";

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
}

export default new UserService();
