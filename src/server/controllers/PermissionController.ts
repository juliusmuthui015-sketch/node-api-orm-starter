import { Request, Response } from 'express';
import permissionService from '@/server/services/PermissionService';

export default {
  async index(req: Request, res: Response) { res.json(await permissionService.list()); },
  async show(req: Request, res: Response) {
    const item = await permissionService.find(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
};
