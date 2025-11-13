import { Request, Response } from 'express';
import permissionService from '@/server/services/PermissionService';

export default {
  async index(req: Request, res: Response) { res.json(await permissionService.list()); },
  async show(req: Request, res: Response) {
    const item = await permissionService.find(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async store(req: Request, res: Response) { res.status(201).json(await permissionService.create(req.body)); },
  async update(req: Request, res: Response) {
    const item = await permissionService.update(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async destroy(req: Request, res: Response) {
    const ok = await permissionService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  }
};
