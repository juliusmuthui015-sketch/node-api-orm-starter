import { asyncLocalStorage } from '@/server/middleware/asyncContext';
import AuthService from '@/server/services/AuthService';
import { User }from '@/server/Models/User';
import {Request} from "express";
import {TRequest} from "@/server/types/types";

export function auth() {
  const store = asyncLocalStorage.getStore();
  const userModel = store ? (store as any).user : undefined;

  return {
    user(): any {
      return userModel || null;
    },
    id(): number | string | undefined {
      return userModel ? (userModel as any).getAttribute ? (userModel as any).getAttribute((userModel.constructor as any).primaryKey || 'id') : userModel.id : undefined;
    },
    check(): boolean {
      return !!userModel;
    }
  };
}

export async function authenticate(email: string, password: string) {
  const res = await AuthService.login(email, password);
  if (!res) return null;
  // load full model instance
  const userModel = await User.where('email', '=', email).with(['roles', 'roles.permissions']).first();
  const store = asyncLocalStorage.getStore();
  if (store) store.user = userModel;
  return { token: res.token, user: userModel };
}

export function setUser(userModel: any) {
  const store = asyncLocalStorage.getStore();
  if (store) store.user = userModel;
}

export function clearUser() {
  const store = asyncLocalStorage.getStore();
  if (store) delete (store as any).user;
}

export const parseRequest = (req:Request) => {
    const {query, params, body, headers, user} = req;
    query.page = Number(query.page) && Number(query.page) > 0 ? Math.floor(Number(query.page)) : 1 as any;
    query.limit = Number(query.limit) && Number(query.limit) > 0 ? Math.floor(Number(query.limit)) : 10 as any;
    return {query, params, body, headers, user} as TRequest;
}

export default auth;
