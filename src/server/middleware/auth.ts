import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {asyncLocalStorage} from "@/server/middleware/asyncContext";
import User from "@/server/Models/User/User";

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change';

declare global {
  namespace Express { interface Request { user?: { id: number|string; roles?: string[]; permissions?: string[] } } }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const uid = decoded.sub;

    // Load full user model (including roles and permissions)
    const userModel = await User.with(['roles', 'roles.permissions']).find(uid);
    if (!userModel) return res.status(401).json({ message: 'Unauthorized' });

    // compute permissions from roles
    const roles = (userModel.toJSON() as any).roles || [];
    const permissionsArr: any[] = [];
    for (const r of roles) {
      permissionsArr.push(...((r as any).permissions || []));
    }

    // set req.user for compatibility and store full model in async local storage
    req.user = { id: uid, roles: roles.map((r:any)=>r.slug), permissions: permissionsArr.map((p:any)=>p.slug) };

    const store = asyncLocalStorage.getStore();
    if (store) {
      store.user = userModel; // store model instance for helpers
    }

    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function authorizeRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles || [];
    if (!roles.some(r => userRoles.includes(r))) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

export function authorizePermissions(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPerms = req.user?.permissions || [];
    if (!perms.some(p => userPerms.includes(p))) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
