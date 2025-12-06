# Middleware

Middleware aliases and factories are registered once and referenced by string in routes.

Register
```ts
import { registerMiddleware } from '@/eloquent/Middleware/middleware';
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';

export function registerDefaults() {
  registerMiddleware('auth', authMiddleware);
  registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
  registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
}
```

Use in routes
```ts
rb.get('/me', 'auth', MeController.show);
rb.post('/users', ['auth','role:admin'], UserController.store);
rb.get('/reports', 'can:view_reports,export_reports', ReportController.index);
```

How resolution works
- Strings are split on `:`; args are comma-separated: `alias:a,b`
- resolveMiddleware() looks up alias; if missing, it tries to require Providers lazily
- Unknown alias throws `Unknown middleware` error

Tips
- Import Providers early (server bootstrap already imports `src/server/Providers/providers`).
- Compose functions and aliases: handlers can be arrays mixing RequestHandlers and strings.

