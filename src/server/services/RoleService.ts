import Role from '@/server/Models/User/Role';
import Permission from '@/server/Models/User/Permission';
import { ModelAttributes } from '@/eloquent/types';
import { query } from '@/config/db.config';

class RoleService {
  async list() { return Role.with(['permissions']).all(); }
  async find(id: number|string) { return Role.with(['permissions']).find(id); }
  async create(data: ModelAttributes) { return Role.create(data); }
  async update(id: number|string, data: ModelAttributes) {
    const role = await Role.find(id);
    if(!role) return null;
    await (role as any).update(data);
    return role;
  }
  async delete(id: number|string) {
    const role = await Role.find(id);
    if(!role) return false;
    await (role).delete();
    return true;
  }
  async attachPermissions(roleId: number|string, permissionIds: (number|string)[]) {
    const role = await Role.find(roleId);
    if(!role) return null;
    const pivot = ['permissions','roles'].sort().join('_');
    const permTable = Permission.getTable();
    // clear existing
    await query(`DELETE FROM ${pivot} WHERE roles_id = ?`, [roleId as any]);
    if (permissionIds.length) {
      const values = permissionIds.map(() => '(?, ?)').join(',');
      const params: any[] = [];
      permissionIds.forEach(id => { params.push(id, roleId); });
      await query(`INSERT INTO ${pivot} (permissions_id, roles_id) VALUES ${values}` as any, params);
    }
    return role;
  }
}

export default new RoleService();
