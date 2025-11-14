# node-backend-orm-starter

Lightweight Node + TypeScript starter combining an Eloquent-style ORM, a fluent router builder, middleware aliasing, and modular controllers/services. Designed as a scaffold for admin-style REST APIs.

## Key features

- Express + TypeScript
- Eloquent-like Model layer and relationship helpers
- Fluent RouterBuilder DSL with scoped prefix and middleware: `prefix()` / `middleware()` / `group()`
- String middleware aliases and middleware factories (e.g. `auth`, `can:view_users`, `role:admin`)
- Providers module for app-level registrations (middleware aliases, bindings)

---

## Quick start

1. Install

   npm install

2. Copy environment

   cp .env.example .env    # adjust values

3. Run in development

   npm run dev

Use `SKIP_DB=true` to skip DB initialization if you only want to run route/middleware code without a DB.

---

## Environment variables

Important variables in `.env`:

- PORT - server port (default 3000)
- JWT_SECRET - JWT signing key used by auth middleware
- DB_* - database connection config
- SKIP_DB - set to `1` or `true` to skip DB init in dev
- SYNC_PERMISSIONS_ON_START - auto-sync permissions on start (optional)

---

## Routing and middleware

This project exposes a RouterBuilder with a concise API for registering routes and scoped middleware.

Example route definitions (src/server/routes/index.ts):

```ts
// Fluent grouping with prefix + middleware
rb.prefix('/api').group(api => {
  api.prefix('/auth').group(auth => {
    auth.post('/login', AuthController.login);
  });

  // apply 'auth' middleware to the /users group
  api.prefix('/users').middleware('auth').group(users => {
    users.get('/', 'can:view_users', UserController.index);
    users.get('/:id', 'can:view_users', UserController.show);
  });
});
```

Handler arguments support:
- RequestHandler functions
- String aliases like `'auth'`, `'can:view_users'`, `'role:admin'`
- Arrays mixing functions and aliases

RouterBuilder resolves string aliases via the middleware registry and applies the resulting RequestHandler(s) to the route.

---

## Middleware registry & providers

Middleware aliases are registered via a `registerMiddleware(name, entry)` function. Entries may be RequestHandler functions or factories that return handlers.

Example provider (src/server/Providers/providers.ts):

```ts
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';
import { registerMiddleware } from '@/eloquent/Middleware/middleware';

export function registerDefaults() {
  registerMiddleware('auth', authMiddleware);
  registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
  registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
}

registerDefaults();
```

Make sure providers are imported early (server entry or routes) so aliases are available when routes are built. The router resolves aliases synchronously; a late import can cause "Unknown middleware" errors.

---

## Models (Eloquent-like)

Models extend a base `Model` and declare `fillable`, `hidden`, `casts` and relationship helpers.

Example (src/server/Models/User/User.ts):

```ts
export class User extends Model {
  static primaryKey = 'id';
  static fillable = ['name','email','password'];

  roles() {
    return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id');
  }
}
```

You can eager load relations and use chainable queries such as
`User.with(['roles','roles.permissions']).find(id)`.

---

## Controllers & Services

Controllers map HTTP requests to service calls. Keep controllers thin — validate input, call a service, return JSON.

Example controller action:

```ts
class UserController {
  static async index(req, res) {
    const q = req.query; // parse params
    const users = await UserService.list(q);
    return res.json(users);
  }
}
```

Services encapsulate DB interactions and business logic.

---

## Middleware examples

- `authMiddleware` — verifies JWT, loads user model, sets `req.user` and saves the model instance to async-local storage.
- `authorizePermissions(...perms)` — returns middleware checking for required permissions.

Use them as string aliases: `'auth'`, `'can:view_users'`, `'role:admin'`.

---

## Troubleshooting

- Error: "Unknown middleware: auth"
  - Cause: providers that register middleware aliases were not imported before routes are built.
  - Fix: import `src/server/Providers/providers` from `server.ts` (before importing routes) or at the top of `src/server/routes/index.ts`.

- If you see circular import issues when trying to import providers from multiple places, prefer importing providers once in server bootstrap before importing routes.

---

## Testing & seeding

- DB migrations/seeders live under `src/db/` and `build/db/`.
- Use the included seeder to populate roles/permissions (see `db/seeders/sync-permissions.ts`).

---

## Contributing

- Keep controllers small and delegate logic to services.
- Add tests for middleware factories and model relationships.
- If adding new middleware aliases, register them in `Providers/providers.ts`.

---

## License

MIT


If you want, I can also add a short CONTRIBUTING.md and an example .env.example file. Let me know which you'd prefer next.
