# Middleware

Middleware provides a mechanism to filter HTTP requests entering your application.

## Overview

Middleware are located in `src/app/Http/Middleware/`. They can:

- Perform actions before a request reaches a controller
- Modify the request or response
- Terminate the request early (e.g., for authentication)

## Built-in Middleware

### Authentication Middleware

Verifies JWT tokens and loads the authenticated user:

```typescript
// src/app/Http/Middleware/auth.ts
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const userModel = await User.with(['profile', 'roles', 'roles.permissions']).find(decoded.sub);
        
        if (!userModel) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        req.user = {
            id: decoded.sub,
            roles: roles.map((r: any) => r.slug),
            permissions: permissionsArr.map((p: any) => p.slug),
        };

        next();
    } catch (e) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
```

Usage in routes:
```typescript
rb.get('/profile', 'auth', ProfileController.show);
```

### Authorization by Status

Ensures the user account is active:

```typescript
// src/app/Http/Middleware/authorizeByStatus.ts
export default function authorizeByStatus(req: Request, res: Response, next: NextFunction) {
    if (auth().check()) {
        const user = auth().user();
        if (user && user.isActive()) {
            next();
            return;
        }
        res.status(401).json({ message: 'Account Inactive' });
        return;
    }
    res.status(401).json({ message: 'Unauthorized' });
}
```

Usage:
```typescript
rb.prefix('/users')
    .middleware(['auth', 'must-be-active'])
    .group((g) => { /* routes */ });
```

### Role Authorization

Check if user has required roles:

```typescript
export function authorizeRoles(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const userRoles = req.user?.roles || [];
        if (!roles.some((r) => userRoles.includes(r))) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        next();
    };
}
```

Usage:
```typescript
rb.get('/admin', ['auth', authorizeRoles('admin')], AdminController.index);
```

### Permission Authorization

Check if user has required permissions:

```typescript
export function authorizePermissions(...perms: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const userPerms = req.user?.permissions || [];
        if (!perms.some((p) => userPerms.includes(p))) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        next();
    };
}
```

Usage with `can:` prefix:
```typescript
rb.get('/users', 'can:view_users', UserController.index);
rb.post('/users', 'can:create_users', UserController.store);
```

## Creating Custom Middleware

### Basic Middleware

```typescript
// src/app/Http/Middleware/LogRequest.ts
import { Request, Response, NextFunction } from 'express';

export function logRequest(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
}
```

### Middleware with Parameters

```typescript
// src/app/Http/Middleware/RateLimit.ts
export function rateLimit(maxRequests: number, windowMs: number) {
    const requests = new Map<string, number[]>();
    
    return (req: Request, res: Response, next: NextFunction) => {
        const ip = req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        const userRequests = (requests.get(ip) || [])
            .filter(time => time > windowStart);
        
        if (userRequests.length >= maxRequests) {
            return res.status(429).json({ message: 'Too many requests' });
        }
        
        userRequests.push(now);
        requests.set(ip, userRequests);
        
        next();
    };
}

// Usage
rb.post('/login', rateLimit(5, 60000), AuthController.login);
```

### Async Middleware

```typescript
// src/app/Http/Middleware/LoadTenant.ts
export async function loadTenant(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'];
    
    if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID required' });
    }
    
    const tenant = await Tenant.find(tenantId);
    
    if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found' });
    }
    
    (req as any).tenant = tenant;
    next();
}
```

## Registering Middleware

### Global Middleware

Apply to all routes in `src/server.ts`:

```typescript
import { logRequest } from '@/app/Http/Middleware/LogRequest';

app.use(logRequest);
```

### Route Middleware

Apply to specific routes or groups:

```typescript
// Single route
rb.get('/dashboard', ['auth', logRequest], DashboardController.index);

// Route group
rb.prefix('/api')
    .middleware(['auth', logRequest])
    .group((g) => {
        // All routes have auth and logRequest middleware
    });
```

### Middleware Aliases

Register aliases in the router configuration:

```typescript
// Built-in aliases
'auth'           -> authMiddleware
'must-be-active' -> authorizeByStatus
'can:*'          -> authorizePermissions
'role:*'         -> authorizeRoles
```

## Middleware Execution Order

Middleware execute in the order they are defined:

```typescript
rb.prefix('/users')
    .middleware(['first', 'second', 'third'])
    .group((g) => {
        // Request flow: first -> second -> third -> controller
        // Response flow: third -> second -> first -> client
    });
```

## Terminating Middleware

Middleware that performs actions after the response is sent:

```typescript
export function responseLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
}
```

## Best Practices

1. **Keep middleware focused**: Each middleware should do one thing well
2. **Order matters**: Place authentication before authorization
3. **Handle errors gracefully**: Always return appropriate status codes
4. **Use async/await**: For database or external API calls
5. **Don't modify request/response excessively**: Keep side effects minimal

