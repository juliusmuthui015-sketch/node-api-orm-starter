import { Request, Response } from 'express';
import roleService from '@/server/services/RoleService';

export default {
  async index(req: Request, res: Response) { res.json(await roleService.list()); },
  async show(req: Request, res: Response) {
    const item = await roleService.find(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async store(req: Request, res: Response) { res.status(201).json(await roleService.create(req.body)); },
  async update(req: Request, res: Response) {
    const item = await roleService.update(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async destroy(req: Request, res: Response) {
    const ok = await roleService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  async syncPermissions(req: Request, res: Response) {
    const role = await roleService.find(req.params.id);
    if (!role) return res.status(404).json({ message: 'Not found' });
    // Expect body: { permissions: number[] }
    const ids = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    // Fallback manual sync via pivot
    const updated = await roleService.attachPermissions(req.params.id, ids);
    res.json(updated);
  }
};
