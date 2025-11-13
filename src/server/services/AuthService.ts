import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import User from '@/server/Models/User';
import Role from '@/server/Models/Role';
import Permission from '@/server/Models/Permission';
import { query } from '@/config/db.config';
import {json} from "node:stream/consumers";

const JWT_SECRET: Secret = (process.env.JWT_SECRET || 'dev-secret-change') as Secret;
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN || '7d') as any;

export class AuthService {
  async register(data: { name: string; email: string; password: string }) {
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await User.create({ name: data.name, email: data.email, password: hashed, active_status: 1 });
    return user;
  }

  async login(email: string, password: string) {

    let user = await User.where('email','=',email).with(['roles', 'roles.permissions']).first()
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) return null;

    const payload: JwtPayload = { sub: String(user.id), email: user.email } as any;
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    const token = jwt.sign(payload, JWT_SECRET, options);
    return { token:token, user: user.toJSON() };
  }

  async getUserRoles(userId: number|string): Promise<string[]> {
    let user = await User.with(['roles', 'roles.permissions']).find(userId)
      console.log(user?.toJSON())
    return (user?.toJSON().roles as any).map(r => r.slug);
  }

  async getUserPermissions(userId: number|string): Promise<string[]> {
    const rolesPivot = ['roles', 'users'].sort().join('_');
    const permPivot = ['permissions', 'roles'].sort().join('_');
    const roleTable = Role.getTable();
    const permTable = Permission.getTable();

    const rows = await query<any>(
      `SELECT DISTINCT p.slug FROM ${permTable} p
       INNER JOIN ${permPivot} pr ON pr.${permTable}_id = p.id
       INNER JOIN ${roleTable} r ON r.id = pr.${roleTable}_id
       INNER JOIN ${rolesPivot} ru ON ru.${roleTable}_id = r.id
       WHERE ru.${User.getTable()}_id = ?`,
      [userId]
    );
    return rows.map(r => r.slug);
  }
}

export default new AuthService();
