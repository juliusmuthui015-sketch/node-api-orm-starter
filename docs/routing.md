# Routing

Routes define the HTTP endpoints of your application.

## Route Files

Routes are defined in `src/routes/`:

- `api.ts` - API routes (prefixed with `/api`)
- `web.ts` - Web routes

## Basic Routing

```typescript
import RouterBuilder from '@/eloquent/Router/router';
import UserController from '@/app/Http/Controllers/User/UserController';

const rb = new RouterBuilder();

rb.get('/users', UserController.index);
rb.post('/users', UserController.store);
rb.get('/users/:id', UserController.show);
rb.put('/users/:id', UserController.update);
rb.delete('/users/:id', UserController.destroy);

export default rb;
```

## Route Groups

```typescript
// Prefix group
rb.prefix('/users').group((g: RouterBuilder) => {
    g.get('/', UserController.index);
    g.get('/:id', UserController.show);
    g.post('/', UserController.store);
});

// With middleware
rb.prefix('/admin')
    .middleware(['auth', 'role:admin'])
    .group((g: RouterBuilder) => {
        g.get('/dashboard', AdminController.dashboard);
    });
```

## Middleware

```typescript
// Single middleware
rb.get('/profile', 'auth', ProfileController.show);

// Multiple middleware
rb.get('/admin', ['auth', 'role:admin'], AdminController.index);

// Permission-based
rb.get('/users', 'can:view_users', UserController.index);
rb.post('/users', 'can:create_users', UserController.store);
```

## Route Parameters

```typescript
// Access in controller
async show(req: Request, res: Response) {
    const id = req.params.id as string;
    const user = await User.find(id);
    res.json(user);
}
```

## List Routes

```bash
pnpm run route:list
```

