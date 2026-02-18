# Getting Started

A comprehensive Node.js API starter template with an Eloquent-style ORM, authentication, role-based permissions, file management, and caching.

## Requirements

- Node.js 18+
- pnpm (recommended) or npm
- MySQL, PostgreSQL, SQLite, or MongoDB

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/node-api-orm-starter.git
cd node-api-orm-starter

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Generate application key
pnpm run key:generate

# Run migrations
pnpm run db:migrate

# Seed the database
pnpm run db:seed

# Start development server
pnpm run dev
```

## Environment Configuration

Configure your `.env` file:

```env
# Application
APP_NAME=MyApp
APP_URL=http://localhost:3000
APP_PORT=3000
APP_ENV=development

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=myapp
DB_USERNAME=root
DB_PASSWORD=

# Authentication
JWT_SECRET=your-secret-key

# Cache (memory, redis, file)
CACHE_DRIVER=memory
REDIS_URL=redis://localhost:6379

# File Uploads
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760
```

## Project Structure

```
src/
├── app/
│   ├── Console/          # Artisan commands
│   ├── Enums/            # Application enums
│   ├── Helpers/          # Helper functions
│   ├── Http/
│   │   ├── Controllers/  # HTTP controllers
│   │   ├── Middleware/   # HTTP middleware
│   │   └── types/        # Request/Response types
│   ├── Models/           # Eloquent models
│   ├── Observers/        # Model observers
│   ├── Providers/        # Service providers
│   └── Services/         # Business logic services
├── bootstrap/
│   └── app.ts            # Application bootstrap
├── cache/                # Cache system
├── config/               # Configuration files
├── database/
│   ├── migrations/       # Database migrations
│   └── seeders/          # Database seeders
├── eloquent/             # ORM core
├── global/               # Global autoloads
├── routes/               # Route definitions
└── types/                # TypeScript declarations
```

## Available Scripts

```bash
# Development
pnpm run dev           # Start with hot reload
pnpm run build         # Build for production
pnpm run start         # Start production server

# Database
pnpm run db:migrate    # Run migrations
pnpm run db:seed       # Run seeders
pnpm run db:fresh      # Drop all tables and re-migrate
pnpm run make:migration <name>  # Create migration

# Tools
pnpm run key:generate  # Generate APP_KEY
pnpm run route:list    # List all routes
pnpm run cache:clear   # Clear application cache
```

## Default Credentials

After seeding, you can log in with:

- **Admin**: `admin@example.com` / `password`
- **User**: `user@example.com` / `password`

## Next Steps

- [Service Providers](./service-providers.md)
- [Routing](./routing.md)
- [Models & ORM](./models.md)
- [Middleware](./middlewares.md)
- [Authentication](./authentication.md)

