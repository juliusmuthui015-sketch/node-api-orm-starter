import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import userService from '@/app/Services/UserService';
import { parseRequest } from '@/app/Helpers/auth';
import { ValidationError } from '@/app/Helpers/validator';
import User from '@/app/Models/User/User';
import {TProfile, TUser} from "@/app/Http/types";

export default {
  async index(req: Request, res: Response) {
    // validate query filters
    const queryRules: any = {
      search: 'nullable|string',
      page: 'nullable|int',
      limit: 'nullable|int',
      sort: 'nullable|string',
      order: 'nullable|string|in:asc,desc',
    };
    try {
      await (req as any).validate(req.query, queryRules);
    } catch (e) {
      /* soft fail */
    }
    const data = await userService.list(parseRequest(req));
    res.json(data);
  },
  async show(req: Request, res: Response) {
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:users,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const item = await userService.find(req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async showProfile(req: Request, res: Response) {
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:users,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }

    const profile = await userService.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Not found' });
    res.json(profile);
  },

  async store(req: Request, res: Response) {
    const rules = {
      name: 'required|string|max:255',
      email: 'required|email|max:255|unique:users,email',
      password: 'required|string|min:6|confirmed',
      phone_number: 'required|string|phone|max:25',
      active_status: 'nullable|int',
      profile: 'nullable',
      roles: 'nullable|array',
      'roles.*': 'nullable|exists:roles,id',
    } as any;

    try {
      let validated = (await req.validate(rules)) as any as Partial<TUser>;
      if (validated.password) validated.password = await bcrypt.hash(validated.password, 10);
      if ((validated as any).confirm_password) delete (validated as any).confirm_password;
      const item = await userService.create(validated as any);
      if (validated.roles) {
        await item.roles().attach(validated.roles);
      }

      if (validated.profile) {
        const profile = validated.profile;
        delete validated.profile;
        validated = (await req.validate(
          { ...(profile ?? []) },
          {
            gender: 'nullable|string|in:male,female',
            type: 'nullable|string|max:50|in:agent,caretaker,admin',
            id_number: 'nullable|string|max:100',
            city: 'nullable|string|max:100',
            country: 'nullable|string|max:100',
            address: 'nullable|string|max:255',
            zip_code: 'nullable|string|max:20',
            date_of_birth: 'nullable|date',
            metadata: 'nullable',
          },
        )) as any as Partial<TProfile>;
        await userService.updateProfile((item as any).id, validated as TProfile);
      }
      res.status(201).json(item);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      res.status(500).json({
        message: (e as any).message || 'Internal server error',
        error: { ...(e as any), message: (e as any).message },
      });
    }
  },
  async addRole(req: Request, res: Response) {
    const userId = req.params.id;
    const rules = {
      role_id: 'required|exists:roles,id',
      user_id: 'required|exists:users,id',
    } as any;
    try {
      await req.validate({ role_id: req.body.role_id, user_id: userId }, rules);
      const updated = await userService.addRole(userId, req.body.role_id);
      if (!updated) return res.status(404).json({ message: 'User not found' });
      return res.json(updated);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
  },
  async removeRole(req: Request, res: Response) {
    const userId = req.params.id;
    const roleId = req.params.roleId;
    try {
      await req.validate({ role_id: roleId }, { role_id: 'required|exists:roles,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const updated = await (userService as any).removeRole(userId, roleId);
    if (!updated) return res.status(404).json({ message: 'User not found' });
    return res.json(updated);
  },
    async toggleStatus(req: Request, res: Response, user: User) {
      if(user){
          user = await user.update({status: user.status == "active"  ? "inactive" : "active"})
      }
      return res.jsonAsync(user);
    }
    ,
  async update(req: Request, res: Response) {
    const rules: any = {
      name: 'nullable|string|max:255',
      email: 'nullable|email|max:255',
      password: 'nullable|string|min:6|confirmed',
      confirm_password: 'nullable|string|min:6',
      phone_number: 'nullable|string|max:25',
      active_status: 'nullable|int',
    };
    let validated: any;
    try {
      validated = await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    if (validated.password) {
      if (validated.password !== req.body.confirm_password)
        return res.status(400).json({ message: 'Passwords do not match' });
      validated.password = await bcrypt.hash(validated.password, 10);
    }
    delete validated.confirm_password;
    const item = await userService.update(req.params.id, validated);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async updateProfile(req: Request, res: Response) {
    const rules: any = {
      gender: 'nullable|string|in:male,female',
      type: 'nullable|string|max:50|in:agent,caretaker,admin',
      id_number: 'nullable|string|max:100',
      city: 'nullable|string|max:100',
      country: 'nullable|string|max:100',
      address: 'nullable|string|max:255',
      zip_code: 'nullable|string|max:20',
      date_of_birth: 'nullable|date',
    };
    let validated: any;
    try {
      validated = await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const profile = await userService.updateProfile(req.params.id, validated);
    if (!profile) return res.status(404).json({ message: 'Not found' });
    res.json(profile);
  },
  async setPassword(req: Request, res: Response) {
    const rules = {
      password: 'required|string|min:6|confirmed',
      confirm_password: 'required|string|min:6',
    };
    try {
      await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const { password } = req.body || {};
    const hashed = await bcrypt.hash(password, 10);
    const user = await userService.setPassword(req.params.id, hashed);
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  async resetPassword(req: Request, res: Response) {
    const rules = {
      password: 'required|string|min:6|confirmed',
      confirm_password: 'required|string|min:6',
    };
    try {
      await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const { password } = req.body || {};
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
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:users,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const ok = await userService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  // landlord/tenant controller helpers removed for starter template
};
