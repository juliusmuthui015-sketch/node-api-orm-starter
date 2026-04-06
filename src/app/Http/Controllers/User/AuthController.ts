import { Request, Response } from 'express';
import authService from '@/app/Services/AuthService';
import { ValidationError } from '@/app/Helpers/validator';
import {TProfile} from "@app/Http/types";
import userService from "@app/Services/UserService";
import {UserRegistered} from "@app/Events";

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
      profile: 'nullable',
    };
    try {
      const validated = (await req.validate(rules)) as any;
      // pick only allowed fields
      const clean: any = {};
      registerFields.forEach((f) => {
        if (validated[f] !== undefined) clean[f] = validated[f];
      });
      const user = await authService.register(clean);

      if (validated.profile) {
        const profileData = validated.profile;
        delete validated.profile;

        const profileValidated = (await req.validate(
            { ...(profileData ?? {}) },
            {
              gender: 'nullable|string|in:male,female',
              type: 'nullable|string|max:50|in:admin,user,staff,agent',
              id_number: 'nullable|string|max:100',
              city: 'nullable|string|max:100',
              country: 'nullable|string|max:100',
              address: 'nullable|string|max:255',
              zip_code: 'nullable|string|max:20',
              date_of_birth: 'nullable|date',
              metadata: 'nullable',
            },
        )) as any as Partial<TProfile>;

        await userService.updateProfile(user.id as any, profileValidated as TProfile);

        const registered = new UserRegistered(String(user.id), user.email, user.name)
        await registered.dispatch();
      }
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
