import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import userService from '@/server/services/UserService';
import {parseRequest} from "@/server/helpers/auth";
import {TUser} from "@/server/types/types";

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
  async showProfile(req: Request, res: Response) {
    const profile = await userService.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Not found' });
    res.json(profile);
  },
  async store(req: Request, res: Response) {
      try {
          const payload = {...req.body} as TUser;
          if (payload.password !== payload.confirm_password) return res.status(400).json({message: 'Passwords do not match'});
          if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);
          if (payload.confirm_password) delete payload.confirm_password;
          const item = await userService.create(payload);
          res.status(201).json(item);
      }
      catch (e) {
          res.status(500).json({ message: (e as any).message ||'Internal server error' , error: {...(e as any), message: (e as any).message}});
      }
  },
  async update(req: Request, res: Response) {
    const payload = { ...req.body };
    if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);
    const item = await userService.update(req.params.id, payload);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async updateProfile(req: Request, res: Response) {
    const payload = { ...req.body };
    const profile = await userService.updateProfile(req.params.id, payload);
    if (!profile) return res.status(404).json({ message: 'Not found' });
    res.json(profile);
  },
  // admin sets a user's password
  async setPassword(req: Request, res: Response) {
    const { password, confirm_password } = req.body || {};
    if (!password) return res.status(400).json({ message: 'Missing password' });
    if (confirm_password && password !== confirm_password) return res.status(400).json({ message: 'Passwords do not match' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await userService.setPassword(req.params.id, hashed);
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  // user resets own password (must be owner or have manage_users permission)
  async resetPassword(req: Request, res: Response) {
    const { password, confirm_password } = req.body || {};
    if (!password) return res.status(400).json({ message: 'Missing password' });
    if (confirm_password && password !== confirm_password) return res.status(400).json({ message: 'Passwords do not match' });
    // allow if owner or has manage_users permission
    const requester = (req as any).user;
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });
    const isOwner = String(requester.id) === String(req.params.id);
    const hasManage = (requester.permissions || []).includes('update_users');
    if (!isOwner && !hasManage) return res.status(403).json({ message: 'Forbidden' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await userService.setPassword(req.params.id, hashed);
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  async destroy(req: Request, res: Response) {
    const ok = await userService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  }
};
