# Server

Express bootstrap wires env, DB, cache, middleware, providers, routes, and error handling.

Flow (src/server/server.ts)
1) dotenv config -> global autoload
2) initDatabase() unless SKIP_DB
3) initCache() unless SKIP_CACHE
4) Mount middleware (asyncContext, requestLogger, validator, responseExtender, modelRegister)
5) Import Providers and routes; mount apiRouter
6) Optional migration lock endpoint
7) 404 JSON and global error handler

Env flags
- SKIP_DB=true
- SKIP_CACHE=true
- SYNC_PERMISSIONS_ON_START=true
- ENABLE_MIGRATION_LOCK_ENDPOINT=true
- PORT=3000

Adding routes
```ts
import apiRouter from '@/server/routes';
app.use(apiRouter);
```

Adding providers
```ts
import '@/server/Providers/providers'; // registers middleware aliases
```

Common middleware
- asyncContextMiddleware: per-request async store
- requestLoggerMiddleware: logs method, url, status, ms, ip, user
- validatorMiddleware: adds req.validate()
- responseExtenderMiddleware: convenience response helpers
- modelRegisterMiddleware: registers models for Router auto-binding

Error handling
- 404 handler returns `{ success:false, message:'Not Found' }`
- errorHandler: centralized JSON error responses
