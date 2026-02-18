# Node API ORM Starter Documentation

A comprehensive Node.js API starter with Eloquent-style ORM, authentication, and more.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm run key:generate
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

## Documentation

- [Getting Started](./getting-started.md)
- [Service Providers](./service-providers.md)
- [Routing](./routing.md)
- [Controllers](./controllers.md)
- [Middleware](./middlewares.md)
- [Models & ORM](./models.md)
- [Query Builder](./query-builder.md)
- [Migrations](./migrations.md)
- [Seeders](./seeders.md)
- [Authentication](./authentication.md)
- [Caching](./caching.md)
- [Observers](./observers.md)
- [Commands](./commands.md)

## Default Credentials

- **Admin**: `admin@example.com` / `password`
- **User**: `user@example.com` / `password`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/users | List users |
| GET | /api/roles | List roles |
| GET | /api/permissions | List permissions |
| GET | /api/files | List files |

