# Node API ORM Starter

Lightweight Node + TypeScript starter that pairs an Eloquent-style ORM with a fluent router, middleware aliasing, and modular server bootstrap. It works with SQL or MongoDB and includes a pluggable cache (file, DB, Redis) with optional encryption.

- Express + TypeScript
- Eloquent-like Model and Query Builder (relations, eager loading, scopes, soft deletes, events)
- Fluent RouterBuilder with grouping, names, constraints, resources, auto model binding
- String middleware aliases and factories (e.g. "auth", "can:view_users", "role:admin")
- Cache manager with drivers (file | database | redis) and APP_KEY-based encryption
- Providers for app-level wiring (middleware aliases, bindings)


## Quick start

1) Install

```bash
pnpm install
# or
npm install
```

2) Env

```bash
cp .env.example .env
# set DB_*, CACHE_DRIVER, APP_KEY, PORT, etc.
```

3) Dev

```bash
npm run dev
```

4) Database (optional but typical)

```bash
# run migrations
npm run migrate

# seed initial data (adjust seeders to your needs)
npm run db:seed

# create a migration file interactively
npm run make:migration

# wipe and re-run everything (dangerous in prod)
npm run migrate:fresh
```

5) Production

```bash
npm run build
npm start
```

Tips
- Set SKIP_DB=true to boot the API without DB connection during route/middleware work.
- Set SKIP_CACHE=true to skip cache init.


## Project layout

- src/eloquent/Model.ts – Model base class (fillable, casts, accessors/mutators, events, relations)
- src/eloquent/EloquentBuilder.ts – Query builder (where, joins, aggregates, eager loading, scopes)
- src/eloquent/Router/router.ts – Fluent RouterBuilder (prefix, middleware, group, names, resources)
- src/eloquent/Middleware/middleware.ts – Middleware registry (alias + factories)
- src/cache/index.ts – Cache manager (file | db | redis) with optional encryption
- src/server/server.ts – Express bootstrap (providers, middleware, routes)
- docs/* – Extra guides (traits/scopes/accessors, API reference, full stack)


## Models (ORM)

Define models by extending Model. You get fillable/hidden/casts, timestamps, soft deletes, relations, events, accessors/mutators, and scopes.

Example

```ts
import { Model } from '@/eloquent/Model';
import { EloquentBuilder } from '@/eloquent/EloquentBuilder';

export class User extends Model {
  static table = 'users';
  static primaryKey = 'id';
  static fillable = ['name', 'email', 'password', 'status'];
  static hidden = ['password'];
  static casts = { created_at: 'date', updated_at: 'date' };
  static timestamps = true;
  static softDeletes = true;

  // Relations
  roles() {
    return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id');
  }

  // Local scopes
  static localScopes = {
    active: (b: EloquentBuilder<any>) => b.where('status', 'active'),
  };

  // Global scopes
  static globalScopes = {
    notBanned: (b: EloquentBuilder<any>) => b.where('status', '!=', 'banned'),
  };
}
```

Core patterns
- Create: `await User.query().create({ name, email })`
- Find: `await User.query().find(id)` / `findOrFail(id)`
- Update: `await User.query().where('status','active').update({ status:'disabled' })`
- Delete: `await instance.delete()` or builder `delete()`; softDeletes respected
- Restore: `await instance.restore()` when softDeletes=true
- Accessors/Mutators: register via `registerAccessor/registerMutator` or `getXAttribute/setXAttribute`
- Events: creating/created/updating/updated/saving/saved/deleting/deleted/restoring/restored/retrieved
- JSON: `model.toJSON({ include:['roles.permissions'], exclude:['secret'] })`

See docs/traits-scopes-accessors.md for accessors/mutators/traits.


## Query Builder

The EloquentBuilder powers `Model.query()` and supports SQL and MongoDB backends. It handles nested where, has/whereHas, aggregates, pagination, soft-deletes filters, eager loading, and named scopes.

Essentials

```ts
// Basic query
const users = await User.query()
  .select(['id','name'])
  .where('status','active')
  .orWhere(b => b.where('email','like','%example.com'))
  .orderBy('created_at','desc')
  .limit(20)
  .get();

// Eager load (any depth)
const withRoles = await User.query()
  .with(['roles','roles.permissions'])
  .get();

// Aggregates & pagination
const total = await User.query().count();
const { data, pagination } = await User.query().paginate(10, 2);

// Soft deletes
await User.query().withTrashed().get();   // include deleted
await User.query().onlyTrashed().get();   // only deleted

// Scopes
await User.query().scope('active').get();
await User.query().scopes({ active: [], role: ['admin'] }).get();
```

Relations loading shortcuts
- `with('roles')` or `with(['roles','roles.permissions'])`
- Per-path options: `with({ 'roles': q => q.where('enabled',1) })`

Has clauses

```ts
// Users with at least 2 roles
await User.query().whereHas('roles', undefined, '>=', 2).get();
// Users that have roles with a given permission
await User.query().whereHas('roles', q => q.whereHas('permissions', qb => qb.where('name','edit_users'))).get();
```


## Relationships

Instance helpers return chainable relation builders; eager loading uses the same metadata.
- hasOne/hasMany: FK on related table, defaults to `${parentTable}_id`
- belongsTo: FK on parent, defaults to `${relatedTable}_id`
- belongsToMany: via pivot `{parent}_{related}` with `parent_id`/`related_id` by default
- morphOne/morphMany/morphTo: simple polymorphism via `{name}_type` and `{name}_id`

Example

```ts
class Post extends Model {
  static table = 'posts';
  comments() { return this.hasMany(Comment, 'post_id'); }
  author() { return this.belongsTo(User, 'user_id'); }
  tags() { return this.belongsToMany(Tag, 'posts_tags', 'post_id', 'tag_id'); }
}
```


## Router & Controllers

RouterBuilder provides a Laravel-style DSL with grouping, prefix/middleware scoping, names, constraints, resources, API resources, redirects, and auto model binding. Middleware strings are resolved via the middleware registry.

Example (src/server/routes/index.ts)

```ts
import RouterBuilder from '@/eloquent/Router/router';
import UserController from '@/server/controllers/UserController';

const rb = new RouterBuilder();
rb.prefix('/api').group(api => {
  api.prefix('/auth').group(auth => {
    auth.post('/login', 'guest', AuthController.login);
  });

  api.prefix('/users').middleware('auth').group(users => {
    users.get('/', 'can:view_users', UserController.index).name('users.index');
    users.get('/:user', 'can:view_users', UserController.show).name('users.show');
    users.post('/', ['auth','role:admin'], UserController.store).name('users.store');
  });
});

export default rb.build();
```

Features
- Grouping: `prefix('/api').middleware('auth').group(cb)`
- Names: `.name('users.index')` and URL generation `rb.route('users.show', { user: 1 })`
- Constraints: `.where('user', /\d+/)` or per-group `where: { user: /\d+/ }`
- Resource routes: `rb.apiResource('users', UserController)`
- Auto model binding: a `:user` param injects a User model instance into the controller action (by parameter order)

Controller signatures supported
- `(req, res)`
- `(req, res, model)` when a single model is bound
- `(req, res, next, ...models)` when using next and/or multiple bindings


## Middleware registry

Register alias or factory middlewares once (usually in Providers) and refer to them by string in routes.

```ts
import { registerMiddleware } from '@/eloquent/Middleware/middleware';
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';

export function registerDefaults() {
  registerMiddleware('auth', authMiddleware);
  registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
  registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
}
```

Usage in routes
- Alias: `'auth'`
- Factory with args: `'can:view_users,edit_users'`, `'role:admin'`

Under the hood, the router calls `resolveMiddleware()` which loads Providers lazily if needed.


## Cache

Cache manager supports file, database, and Redis drivers. All drivers share the same API and can optionally encrypt values using APP_KEY (Laravel-style key or base64:... form).

Env
- CACHE_DRIVER=file | database | redis
- CACHE_PREFIX=app
- APP_KEY=base64:...
- REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD

API

```ts
import cache, { cacheGet, cacheSet, cacheDel, cacheHas, cacheClear, cacheKeys, generateCacheKey } from '@/cache';

await cacheSet('users:count', 42, 300);         // ttl seconds
const n = await cacheGet('users:count');
await cacheDel('users:count');
const has = await cacheHas('users:count');
const keys = await cacheKeys();                 // list keys (without prefix)

const key = generateCacheKey('users', 'page', 1, 'q', 'john');
```

Notes
- File driver stores JSON payloads under tmp/cache; DB driver uses Cache model/table; Redis requires `redis` package.
- When APP_KEY is present and valid (32 bytes or base64), values are transparently encrypted (AES-256-CBC) with MAC.


## Server bootstrap

The server wires middleware, providers, cache, routes, and optional endpoints.

Key middleware (src/server/server.ts)
- asyncContextMiddleware – per-request async store
- requestLoggerMiddleware – logs method, url, status, duration, ip, user
- validatorMiddleware – adds request.validate helper
- responseExtenderMiddleware – convenience response helpers
- modelRegisterMiddleware – auto-registers models for Router auto-binding

Env switches
- SKIP_DB=true – start without DB
- SKIP_CACHE=true – start without cache
- SYNC_PERMISSIONS_ON_START=true – optional permissions sync hook
- ENABLE_MIGRATION_LOCK_ENDPOINT=true – exposes GET /internal/migrations/lock

Startup order
1) Load env and global autoload
2) initDatabase() unless SKIP_DB
3) initCache() unless SKIP_CACHE
4) Mount middlewares and routes
5) 404 JSON and global error handler


## Recipes (examples & scenarios)

- Search + pagination with deep eager loading
  ```ts
  const { page = 1, q } = req.query;
  const qb = Article.query()
    .with(['author','tags','comments.author'])
    .latest();
  if (q) qb.where(b => b.where('title','like',`%${q}%`).orWhere('body','like',`%${q}%`));
  const result = await qb.paginate(10, Number(page));
  ```

- Deep whereHas filtering
  ```ts
  // Users that have a role with a permission
  const users = await User.query()
    .whereHas('roles', r => r.whereHas('permissions', p => p.where('name','edit_users')))
    .get();
  ```

- Count related and sort by it
  ```ts
  const posts = await Post.query()
    .with('comments')
    .withCount('comments')
    .orderBy('comments_count','desc')
    .get();
  ```

- Custom model binder for non-id route params
  ```ts
  rb.model('order', async (value) => {
    return await Order.query().where('uuid', value).firstOrFail();
  });
  rb.get('/orders/:order', 'auth', (req, res, order) => res.json(order));
  ```

- Cache a paginated endpoint with encryption
  ```ts
  const key = generateCacheKey('articles','page',page,'q',q||'');
  const cached = await cacheGet(key);
  if (cached) return res.json(cached);
  const out = await Article.query().with('author').paginate(10, Number(page));
  await cacheSet(key, out, 60); // TTL seconds; encrypted when APP_KEY set
  return res.json(out);
  ```

- Mongo id notes
  - id ↔ _id normalized; `*_id` coerced to ObjectId when 24-hex.
  - whereHas is post-filtered; prefer constraints and pagination to limit fetch size.


## CLI & utilities

```bash
# list routes with names and methods
npm run route:list

# cache operations (get/set/del/keys) from CLI
npm run cache:cli

# generate APP_KEY (copy into .env)
npm run key:generate

# smoke checks (optional local diagnostics)
npm run smoke:traits
npm run smoke:scopes
npm run smoke:redis
```


## More docs

- docs/API_REFERENCE.md
- docs/traits-scopes-accessors.md
- docs/query-builder.md
- docs/orm.md
- docs/router.md
- docs/middleware.md
- docs/cache.md
- docs/server.md
- docs/full-stack-guide.md

MIT License
