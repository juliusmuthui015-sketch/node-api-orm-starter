import { Request, Response } from 'express';
import authService from '@/server/services/AuthService';

export default {
  async register(req: Request, res: Response) {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    const user = await authService.register({ name, email, password });
    res.status(201).json(user);
  },
  async login(req: Request, res: Response) {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
    const result = await authService.login(email, password);
    if (!result) return res.status(401).json({ message: 'Invalid credentials' });
    res.json(result);
  }
};
