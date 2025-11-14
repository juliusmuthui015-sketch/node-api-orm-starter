import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import {TPermission, TRole} from "@/server/types/types";
import User from "@/server/Models/User/User";

const JWT_SECRET: Secret = (process.env.JWT_SECRET || 'dev-secret-change') as Secret;
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN || '7d') as any;

export class AuthService {
  async register(data: { name: string; email: string; password: string }) {
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await User.create({ name: data.name, email: data.email, password: hashed, active_status: 1 });
    return user;
  }

  async login(email: string, password: string) {

    let user = await User.where('email','=',email).with(['profile','roles', 'roles.permissions']).first()
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) return null;

    const payload: JwtPayload = { sub: String(user.id), email: user.email } as any;
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    const token = jwt.sign(payload, JWT_SECRET, options);
    return { token:token, user: user.toJSON() };
  }

  async getUserRoles(userId: number|string): Promise<TRole[]> {
    let user = await User.with(['profile','roles', 'roles.permissions']).find(userId)
    if (!user || !user.toJSON().roles) return []
    return (user?.toJSON()?.roles as TRole[]);
  }

  async getUserPermissions(userId: number|string): Promise<TPermission[]> {
      let roles = await this.getUserRoles(userId)
      let permissions = []
      for (const role of roles) {
        permissions.push(...(role).permissions)
      }
      return permissions
  }
}

export default new AuthService();
