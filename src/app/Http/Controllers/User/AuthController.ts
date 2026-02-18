import { Request, Response } from 'express';
import authService from '@/app/Services/AuthService';
import { ValidationError } from '@/app/Helpers/validator';

const registerFields = ['name', 'email', 'password'];
const loginFields = ['email', 'password'];

export default {
  async register(req: Request, res: Response) {
    // validate incoming registration payload
    const rules: any = {
      name: 'required|string|max:191',
      email: 'required|email|max:255|unique:users,email',
      password: 'required|string|min:6|confirmed',
      password_confirmation: 'required|string|min:6',
    };
    try {
      const validated = (await req.validate(rules)) as any;
      // pick only allowed fields
      const clean: any = {};
      registerFields.forEach((f) => {
        if (validated[f] !== undefined) clean[f] = validated[f];
      });
      const user = await authService.register(clean);
      return res.status(201).json(user);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
  },
  async login(req: Request, res: Response) {
    const rules: any = {
      email: 'required|email|max:255',
      password: 'required|string|min:6',
    };
    try {
      const validated = (await req.validate(rules)) as any;
      const clean: any = {};
      loginFields.forEach((f) => {
        if (validated[f] !== undefined) clean[f] = validated[f];
      });
      const result = await authService.login(clean.email, clean.password);
      if (!result) return res.status(401).json({ message: 'Invalid credentials' });
      return res.json(result);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
  },

  async me(req: Request, res: Response) {
    const user = await auth()?.user()?.toJSON();
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    res.json({ data: user });
  },
};
