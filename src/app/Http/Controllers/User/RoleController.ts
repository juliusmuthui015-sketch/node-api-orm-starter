import { Request, Response } from 'express';
import roleService from '@/app/Services/RoleService';
import { ValidationError } from '@/app/Helpers/validator';
import { Role } from '@/app/Models/User';

const roleFields = ['name', 'slug', 'description'];

function makeSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default {
  async index(req: Request, res: Response) {
    res.json(await roleService.list());
  },
  async show(req: Request, res: Response, role: Role) {
    let validated: any;
    if (!role) {
      try {
        validated = await req.validate({ id: req.params.role }, { id: 'required|exists:roles,id' });
      } catch (e) {
        if (e instanceof ValidationError)
          return res.status(422).json({ errors: e.errors, messages: e.messages });
        throw e;
      }
    } else {
      await role.load('permissions');
      res.json(role);
    }
    const item = await roleService.find((role.id as any) || validated.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
  async store(req: Request, res: Response) {
    const rules: any = {
      name: 'required|string|max:191',
      slug: 'nullable|string|max:191|unique:roles,slug',
      description: 'nullable|string',
    };
    try {
      const validated = (await req.validate(rules)) as any;
      if (!validated.slug && validated.name) validated.slug = makeSlug(validated.name);
      const clean: any = {};
      roleFields.forEach((f) => {
        if (validated[f] !== undefined) clean[f] = validated[f];
      });
      const created = await roleService.create(clean);
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
  },
  async update(req: Request, res: Response) {
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:roles,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const rules: any = {
      name: 'nullable|string|max:191',
      slug: 'nullable|string|max:191|unique:roles,slug,' + req.params.id,
      description: 'nullable|string',
    };
    try {
      const validated = (await req.validate(rules)) as any;
      if (validated.name && !validated.slug) validated.slug = makeSlug(validated.name);
      const clean: any = {};
      roleFields.forEach((f) => {
        if (validated[f] !== undefined) clean[f] = validated[f];
      });
      const item = await roleService.update(req.params.id, clean);
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json(item);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
  },
  async destroy(req: Request, res: Response) {
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:roles,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const ok = await roleService.delete(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  },
  async syncPermissions(req: Request, res: Response) {
    // body.permissions: array of ints
    const rules: any = { permissions: 'required|array' };
    try {
      await req.validate({ id: req.params.id }, { id: 'required|exists:roles,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    let validated: any;
    try {
      validated = await req.validate(rules);
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const ids = validated.permissions ?? [];
    const updated = await roleService.attachPermissions(req.params.id, ids);
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  },
};
