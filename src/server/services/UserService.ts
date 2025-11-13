import User from '@/server/Models/User';
import { ModelAttributes } from '@/eloquent/types';
import {TRequest} from "@/server/types/types";

export class UserService {
  async list(request: TRequest) {
      const {query} = request;
      let users = User.query();
      if (query.search) {
         users.where('name', 'like', `%${query.search}%`)
            .orWhere('email', 'like', `%${query.search}%`)
            .orWhere('phone_number', 'like', `%${query.search}%`);
      }
      // parse pagination params safely (page must be >= 1 to avoid negative OFFSET)
      const limit = Number(query.limit) && Number(query.limit) > 0 ? Math.floor(Number(query.limit)) : 10;
      const page = Number(query.page) && Number(query.page) > 0 ? Math.floor(Number(query.page)) : 1;

      return await users.paginate(limit, page);
  }
  async find(id: number|string) { return User.find(id); }
  async create(data: ModelAttributes) { return User.create(data); }
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
