import { Request, Response } from 'express';
import permissionService from '@/app/Services/PermissionService';
import { ValidationError } from '@/app/Helpers/validator';

export default {
  async index(req: Request, res: Response) {
    // optional: allow future filtering (name search)
    const rules: any = { search: 'nullable|string' };
    try {
      await (req as any).validate(req.query, rules);
    } catch (_) {}
    res.json(await permissionService.list());
  },
  async show(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      await req.validate({ id }, { id: 'required|exists:permissions,id' });
    } catch (e) {
      if (e instanceof ValidationError)
        return res.status(422).json({ errors: e.errors, messages: e.messages });
      throw e;
    }
    const item = await permissionService.find(id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  },
};
