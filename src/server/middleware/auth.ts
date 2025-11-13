import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import authService from '@/server/services/AuthService';

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
    const roles = await authService.getUserRoles(uid);
    let permissions = []
    for (const role of roles) {
      permissions.push(...(role).permissions)
    }
    console.log(permissions)
    const perms = await authService.getUserPermissions(uid);
    req.user = { id: uid, roles: (roles)?.map(r => r.slug), permissions: permissions?.map(p => p.slug) };
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
