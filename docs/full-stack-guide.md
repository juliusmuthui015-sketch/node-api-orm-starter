# Full‑Stack Guide

This guide shows an end‑to‑end path: set up env, run DB, register middleware, define models, routes, controllers/services, add caching, and ship.

## Prerequisites
- Node.js 18 or higher
- MySQL or MongoDB (configure one in .env and src/config/db.config.ts)
- Optional: Redis for cache driver

## 1. Setup
```bash
# install dependencies
yarn install || npm install

# set up environment variables
cp .env.example .env
npm run key:generate # copy APP_KEY into .env

# set up database (for SQL, run this in the directory containing the SQL files)
npm run migrate
npm run db:seed

# start development server
npm run dev
```

## 2. Register Middleware Aliases (Providers)
Create or edit `src/server/Providers/providers.ts` and ensure it’s imported by the server bootstrap (it already is in `src/server/server.ts`).

```ts
import { registerMiddleware } from '@/eloquent/Middleware/middleware';
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';

export function registerDefaults() {
  registerMiddleware('auth', authMiddleware);
  registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
  registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
}

registerDefaults();
```

## 3. Define a Model
```ts
// src/server/Models/User/User.ts
import { Model } from '@/eloquent/Model';

export default class User extends Model {
  static table = 'users';
  static primaryKey = 'id';
  static fillable = ['name','email','password','status'];
  static hidden = ['password'];
  static timestamps = true;
  static softDeletes = true;

  roles() { return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id'); }
}
```

## 4. Routes with RouterBuilder
```ts
// src/server/routes/index.ts
import RouterBuilder from '@/eloquent/Router/router';
import AuthController from '@/server/controllers/AuthController';
import UserController from '@/server/controllers/UserController';

const rb = new RouterBuilder();
rb.prefix('/api').group(api => {
  api.prefix('/auth').group(auth => {
    auth.post('/login', 'guest', AuthController.login).name('auth.login');
  });

  api.prefix('/users').middleware('auth').group(users => {
    users.get('/', 'can:view_users', UserController.index).name('users.index');
    users.get('/:user', 'can:view_users', UserController.show).name('users.show');
    users.post('/', ['auth','role:admin'], UserController.store).name('users.store');
    users.put('/:user', ['auth','role:admin'], UserController.update).name('users.update');
    users.delete('/:user', ['auth','role:admin'], UserController.destroy).name('users.destroy');
  });
});

export default rb.build();
```

## 5. Controllers & Services
```ts
// src/server/controllers/UserController.ts
import { Request, Response } from 'express';
import UserService from '@/server/services/UserService';

export default class UserController {
  static async index(req: Request, res: Response) {
    const out = await UserService.list(req.query);
    return res.json(out);
  }
  static async show(req: Request, res: Response, user: any) {
    return res.json(await user.toJSON({ include: ['roles'] }));
  }
  static async store(req: Request, res: Response) {
    const out = await UserService.create(req.body);
    return res.status(201).json(out);
  }
  static async update(req: Request, res: Response, user: any) {
    const out = await UserService.update(user, req.body);
    return res.json(out);
  }
  static async destroy(req: Request, res: Response, user: any) {
    await UserService.delete(user);
    return res.status(204).send();
  }
}
```

```ts
// src/server/services/UserService.ts
import User from '@/server/Models/User/User';
import { cacheGet, cacheSet, cacheDel, generateCacheKey } from '@/cache';

export default class UserService {
  static async list(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(query.perPage || '25', 10)));
    const key = generateCacheKey('users', 'page', page, 'perPage', perPage);
    const cached = await cacheGet(key);
    if (cached) return cached;

    const result = await User.query().with('roles').paginate(perPage, page);
    await cacheSet(key, result, 60); // cache for 1 minute
    return result;
  }

  static async create(payload: any) {
    const user = await User.query().create(payload);
    // bust cache for page 1
    await cacheDel(generateCacheKey('users', 'page', 1, 'perPage', 25));
    return user.toJSON({ include: ['roles'] });
  }

  static async update(user: any, payload: any) {
    user.fill(payload);
    await user.save();
    return user.toJSON({ include: ['roles'] });
  }

  static async delete(user: any) {
    await user.delete();
  }
}
```

## 6. Middleware Usage
- Use aliases in routes: `'auth'`, `'role:admin'`, `'can:view_users'`
- Compose arrays of handlers and aliases
- Auto model binding injects models by route param name: `'/users/:user'` → user model

## 7. Cache
- Driver: `CACHE_DRIVER=file|database|redis`
- Prefix: `CACHE_PREFIX=app`
- Encryption: `APP_KEY` enables AES‑256‑CBC + MAC
- Helpers: `cacheGet`, `cacheSet`, `cacheDel`, `cacheKeys`, `generateCacheKey`

## 8. Route List & Utilities
```bash
npm run route:list   # print named routes
npm run cache:cli    # inspect cache via CLI
npm run key:generate # create APP_KEY
```

## 9. Troubleshooting
- Unknown middleware: ensure `src/server/Providers/providers` is imported before routes (it is in `server.ts`)
- `SKIP_DB=true` to boot without DB; `SKIP_CACHE=true` to skip cache initialization
- Redis driver requires the `redis` package
- MongoDB: ids normalize (`id` <-> `_id`); `whereHas` filters post‑query—add constraints and paginate

## 10. Deploy
```bash
npm run build
npm start
```

## Next Steps
- See `docs/query-builder.md`, `docs/orm.md`, `docs/router.md`, `docs/middleware.md`, `docs/cache.md`, `docs/server.md`.
