import User from '@/server/Models/User';
import { ModelAttributes } from '@/eloquent/types';
import {TRequest} from "@/server/types/types";

export class UserService {
  async list(request: TRequest) {
      const {query} = request;
      return User.all();
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
