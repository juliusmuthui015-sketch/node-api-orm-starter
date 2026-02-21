# Laravel-Style Directory Structure

This document describes the reorganized codebase following Laravel conventions.

## Directory Structure

```
src/
├── app/                        # Application code
│   ├── Console/               # Artisan commands
│   │   ├── Command.ts         # Base command class
│   │   ├── Commands/          # Individual commands
│   │   │   ├── CacheCommands.ts
│   │   │   ├── DatabaseCommands.ts
│   │   │   ├── KeyGenerateCommand.ts
│   │   │   ├── MigrationCommands.ts
│   │   │   ├── RouteCommands.ts
│   │   │   └── index.ts
│   │   └── Kernel.ts          # Console kernel (auto-loads commands)
│   ├── Enums/                 # Application enumerations
│   ├── Helpers/               # Helper functions
│   ├── Http/                  # HTTP layer
│   │   ├── Controllers/       # Request controllers
│   │   ├── Kernel.ts          # HTTP kernel (middleware)
│   │   ├── Middleware/        # HTTP middleware
│   │   └── types/             # HTTP type definitions
│   ├── Models/                # Eloquent models
│   ├── Observers/             # Model observers
│   ├── Providers/             # Service providers
│   │   ├── AppServiceProvider.ts
│   │   ├── Application.ts
│   │   └── RouteServiceProvider.ts
│   └── Services/              # Business logic services
├── bootstrap/                 # Application bootstrapping
│   └── app.ts                 # Application initialization
├── cache/                     # Cache system
├── config/                    # Configuration files
├── database/                  # Database migrations & seeders
│   ├── index.ts               # Database exports
│   ├── Schema.ts              # Schema builder
│   ├── migrations/            # Migration files
│   └── seeders/               # Seeder files
├── eloquent/                  # ORM framework code
├── global/                    # Global autoloaders
├── routes/                    # Route definitions
│   ├── api.ts                 # API routes
│   ├── property.ts            # Property routes
│   └── web.ts                 # Web routes
├── artisan.ts                 # Artisan CLI entry point
└── server.ts                  # Application entry point
```

## Artisan Commands

All commands are auto-loaded from `app/Console/Commands` via the Console Kernel.

```bash
# Available commands
pnpm artisan --help

# Key generation
pnpm artisan key:generate
pnpm artisan key:generate --write
pnpm artisan key:generate --force

# Cache management
pnpm artisan cache:clear
pnpm artisan cache:list
pnpm artisan cache:get <key>
pnpm artisan cache:set <key> <value>
pnpm artisan cache:forget <key>
pnpm artisan cache:has <key>
pnpm artisan cache:driver

# Database migrations
pnpm artisan migrate
pnpm artisan migrate:fresh
pnpm artisan migrate:fresh --seed
pnpm artisan make:migration <name>
pnpm artisan make:migration <name> --table=users
pnpm artisan make:migration <name> --table=users --alter

# Database seeding
pnpm artisan db:seed

# Route listing
pnpm artisan route:list
pnpm artisan route:list --method=GET
pnpm artisan route:list --path=/api/users
pnpm artisan route:list --json
```

## NPM Scripts

```bash
# Development
pnpm dev                    # Start development server

# Artisan Commands
pnpm artisan <command>      # Run artisan command

# Database
pnpm migrate                # Run migrations
pnpm migrate:fresh          # Fresh migration
pnpm make:migration <name>  # Create migration
pnpm db:seed                # Seed database

# Utilities
pnpm key:generate           # Generate APP_KEY
pnpm cache:clear            # Clear cache
pnpm route:list             # List routes
pnpm build                  # Build for production
pnpm start                  # Start production server
```

## Service Providers

Service providers bootstrap application services in `app/Providers/`:

- **Application.ts** - Core application container
- **AppServiceProvider.ts** - Registers core services and observers
- **RouteServiceProvider.ts** - Configures routing (mounts API and web routes)

## HTTP & Console Kernels

- **HTTP Kernel** (`app/Http/Kernel.ts`) - Registers HTTP middleware
- **Console Kernel** (`app/Console/Kernel.ts`) - Auto-loads and registers CLI commands

## Creating New Commands

1. Create a new command in `app/Console/Commands/`:

```typescript
import { Command } from '@/app/Console/Command';
import { ArgumentsCamelCase } from 'yargs';

export class MyCommand extends Command {
    protected signature = 'my:command <arg>';
    protected description = 'Description of my command';

    protected arguments = {
        arg: { type: 'string' as const, description: 'Argument description', required: true },
    };

    protected options = {
        flag: { type: 'boolean' as const, description: 'Flag description', default: false },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        this.info('Command executed!');
        this.line(`Argument: ${args.arg}`);
    }
}
```

2. Export it in `app/Console/Commands/index.ts`:

```typescript
export { MyCommand } from './MyCommand';
```

The Console Kernel will automatically discover and register the command.

