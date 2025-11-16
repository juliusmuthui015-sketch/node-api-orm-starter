API Reference — Controller + Service examples

This document contains concise, copy-pasteable TypeScript examples showing a full controller and service for the User resource, how to register routes with the RouterBuilder, and example requests.

1) UserController (src/server/controllers/UserController.ts)

```ts
import { Request, Response } from 'express';
import UserService from '@/server/services/UserService';

export default class UserController {
  static async index(req: Request, res: Response) {
    try {
      const users = await UserService.list(req.query);
      return res.json(users);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }

  static async show(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const user = await UserService.find(id);
      if (!user) return res.status(404).json({ message: 'Not found' });
      return res.json(user);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }

  static async store(req: Request, res: Response) {
    try {
      const payload = req.body;
      const user = await UserService.create(payload);
      return res.status(201).json(user);
    } catch (err) {
      return res.status(400).json({ error: String(err) });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const payload = req.body;
      const updated = await UserService.update(id, payload);
      return res.json(updated);
    } catch (err) {
      return res.status(400).json({ error: String(err) });
    }
  }

  static async destroy(req: Request, res: Response) {
    try {
      const id = req.params.id;
      await UserService.delete(id);
      return res.status(204).send();
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }
}
```

2) UserService (src/server/services/UserService.ts)

```ts
import User from '@/server/Models/User/User';

export default class UserService {
  static async list(query: any) {
    // simple pagination example
    const page = Number(query.page || 1);
    const perPage = Math.min(Number(query.perPage || 25), 100);
    const qb = User.query().with(['roles']);
    const rows = await qb.paginate(page, perPage);
    return rows;
  }

  static async find(id: string | number) {
    return User.with(['roles', 'profile']).find(id);
  }

  static async create(payload: any) {
    // validation and sanitization should happen before here
    const u = new User(payload);
    await u.save();
    return u.toJSON();
  }

  static async update(id: string | number, payload: any) {
    const u = await User.find(id);
    if (!u) throw new Error('Not found');
    u.fill(payload);
    await u.save();
    return u.toJSON();
  }

  static async delete(id: string | number) {
    const u = await User.find(id);
    if (!u) throw new Error('Not found');
    await u.delete();
    return true;
  }
}
```

3) Register routes with RouterBuilder (src/server/routes/index.ts)

```ts
import RouterBuilder from '@/eloquent/Router/router';
import UserController from './UserController';

const rb = new RouterBuilder();

rb.prefix('/api').middleware('auth').group(api => {
    api.prefix('/users').group(users => {
        users.get('/', 'can:view_users', UserController.index);
        users.get('/:id', 'can:view_users', UserController.show);
        users.post('/', 'can:create_users', UserController.store);
        users.put('/:id', 'can:update_users', UserController.update);
        users.delete('/:id', 'can:delete_users', UserController.destroy);
    });
});

export default rb.build();
```

4) Example requests (curl)

- List users (requires valid Authorization token):

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/users?page=1&perPage=25"
```

- Create a user

```bash
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret"}' \
  http://localhost:3000/api/users
```

Notes & best practices
- Validation: Add request validation (e.g. with a validator middleware) before calling service.create/update.
- Error mapping: Services should throw meaningful errors; controllers map them to appropriate HTTP responses.
- Transactions: For multi-step operations (roles sync, etc.) use DB transactions in the service layer.
- Async local store: auth middleware sets the full user model in async local storage for deeper helpers.

This document is intended to be a quick, practical reference you can copy into your project. Adjust names and paths to match your application structure if you deviate from the starter layout.
