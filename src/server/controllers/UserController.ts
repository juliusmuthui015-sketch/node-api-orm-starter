import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import userService from '@/server/services/UserService';
import {parseRequest} from "@/server/helpers/auth";

export default {
  async index(req: Request, res: Response) {
    const data = await userService.list(parseRequest(req));
    res.json(data);
  },
  async show(req: Request, res: Response) {
    const item = await userService.find(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async store(req: Request, res: Response) {
    const payload = { ...req.body };
    if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);
    const item = await userService.create(payload);
    res.status(201).json(item);
  },
  async update(req: Request, res: Response) {
    const payload = { ...req.body };
    if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);
    const item = await userService.update(req.params.id, payload);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async destroy(req: Request, res: Response) {
    const ok = await userService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  }
};
