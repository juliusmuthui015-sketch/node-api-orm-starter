# Console Commands (Artisan)

The starter includes a command-line interface for common tasks, inspired by Laravel's Artisan.

## Available Commands

### Database Commands

```bash
# Run all pending migrations
pnpm run db:migrate

# Rollback and re-run all migrations
pnpm run db:fresh

# Run database seeders
pnpm run db:seed

# Run a specific seeder
pnpm run db:seed -- --class=DatabaseSeeder

# Create a new migration
pnpm run make:migration create_posts_table
pnpm run make:migration add_status_to_users_table
```

### Application Commands

```bash
# Generate application key
pnpm run key:generate

# List all registered routes
pnpm run route:list

# Clear application cache
pnpm run cache:clear
```

### Development

```bash
# Start development server with hot reload
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm run start
```

## Creating Custom Commands

### Basic Command Structure

Create commands in `src/app/Console/Commands/`:

```typescript
// src/app/Console/Commands/SendEmailsCommand.ts
import { Command } from '@/eloquent/Command/Command';

export class SendEmailsCommand extends Command {
    // Command signature
    signature = 'emails:send {--queue : Queue the emails}';
    
    // Command description
    description = 'Send pending emails to users';

    async handle(): Promise<void> {
        const shouldQueue = this.option('queue');
        
        this.info('Sending emails...');
        
        // Your command logic here
        const users = await User.where('email_pending', true).get();
        
        for (const user of users) {
            if (shouldQueue) {
                await this.queueEmail(user);
            } else {
                await this.sendEmail(user);
            }
            this.line(`Email sent to ${user.email}`);
        }
        
        this.success(`Sent ${users.length} emails!`);
    }

    private async sendEmail(user: any) {
        // Send email logic
    }

    private async queueEmail(user: any) {
        // Queue email logic
    }
}
```

### Command Arguments and Options

```typescript
// Arguments: required positional values
signature = 'user:create {name} {email}';

// Optional arguments
signature = 'user:create {name} {email?}';

// Arguments with defaults
signature = 'user:create {name} {email=default@example.com}';

// Options (flags)
signature = 'user:create {name} {--admin}';

// Options with values
signature = 'user:create {name} {--role=user}';

// Options with shortcuts
signature = 'user:create {name} {--A|admin}';
```

### Accessing Arguments and Options

```typescript
async handle(): Promise<void> {
    // Get argument value
    const name = this.argument('name');
    
    // Get option value
    const isAdmin = this.option('admin');
    const role = this.option('role');
    
    // Get all arguments
    const args = this.arguments();
    
    // Get all options
    const opts = this.options();
}
```

### Output Methods

```typescript
async handle(): Promise<void> {
    // Regular output
    this.line('Regular text');
    
    // Information (blue)
    this.info('Information message');
    
    // Success (green)
    this.success('Operation successful!');
    
    // Warning (yellow)
    this.warn('Warning message');
    
    // Error (red)
    this.error('Error message');
    
    // Table output
    this.table(
        ['Name', 'Email', 'Role'],
        [
            ['John', 'john@example.com', 'admin'],
            ['Jane', 'jane@example.com', 'user'],
        ]
    );
    
    // Progress bar
    const bar = this.progressBar(100);
    for (let i = 0; i < 100; i++) {
        bar.advance();
        await sleep(10);
    }
    bar.finish();
}
```

### Interactive Input

```typescript
async handle(): Promise<void> {
    // Ask for input
    const name = await this.ask('What is your name?');
    
    // Ask with default
    const email = await this.ask('Email?', 'default@example.com');
    
    // Secret input (hidden)
    const password = await this.secret('Password?');
    
    // Confirmation
    if (await this.confirm('Do you want to continue?')) {
        // proceed
    }
    
    // Choice
    const role = await this.choice('Select a role:', ['admin', 'user', 'guest']);
}
```

## Registering Commands

### In Artisan Kernel

```typescript
// src/app/Console/Kernel.ts
import { SendEmailsCommand } from './Commands/SendEmailsCommand';
import { CleanupCommand } from './Commands/CleanupCommand';

export class Kernel {
    protected commands = [
        SendEmailsCommand,
        CleanupCommand,
    ];

    public register(): void {
        for (const Command of this.commands) {
            this.registerCommand(new Command());
        }
    }
}
```

### Adding npm Scripts

```json
// package.json
{
    "scripts": {
        "emails:send": "ts-node src/artisan.ts emails:send",
        "cleanup": "ts-node src/artisan.ts cleanup"
    }
}
```

## Example Commands

### Database Cleanup Command

```typescript
// src/app/Console/Commands/CleanupCommand.ts
export class CleanupCommand extends Command {
    signature = 'db:cleanup {--days=30 : Days to keep}';
    description = 'Clean up old database records';

    async handle(): Promise<void> {
        const days = parseInt(this.option('days') || '30');
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        this.info(`Cleaning up records older than ${days} days...`);

        // Delete old logs
        const deleted = await AuditLog
            .where('created_at', '<', cutoff)
            .delete();

        this.success(`Deleted ${deleted} old records.`);
    }
}
```

### User Management Command

```typescript
// src/app/Console/Commands/CreateUserCommand.ts
export class CreateUserCommand extends Command {
    signature = 'user:create {email} {--admin : Create as admin}';
    description = 'Create a new user';

    async handle(): Promise<void> {
        const email = this.argument('email');
        const isAdmin = this.option('admin');

        const name = await this.ask('User name?');
        const password = await this.secret('Password?');

        const user = await User.create({
            name,
            email,
            password: await bcrypt.hash(password, 10),
        });

        if (isAdmin) {
            const adminRole = await Role.where('slug', 'admin').first();
            if (adminRole) {
                await user.roles().attach(adminRole.id);
            }
        }

        this.success(`User created: ${user.email}`);
    }
}
```

### Cache Management Command

```typescript
// src/app/Console/Commands/CacheCommand.ts
export class CacheCommand extends Command {
    signature = 'cache:clear {--prefix= : Clear only keys with prefix}';
    description = 'Clear application cache';

    async handle(): Promise<void> {
        const prefix = this.option('prefix');

        if (prefix) {
            await cacheDelPrefix(prefix);
            this.success(`Cleared cache keys with prefix: ${prefix}`);
        } else {
            await cacheClear();
            this.success('Application cache cleared!');
        }
    }
}
```

## Scheduling Commands

For scheduled tasks, use cron or a scheduler:

```typescript
// src/app/Console/Kernel.ts
export class Kernel {
    protected schedule(): void {
        // Run daily at midnight
        this.command('db:cleanup').dailyAt('00:00');
        
        // Run every hour
        this.command('emails:send').hourly();
        
        // Run every 5 minutes
        this.command('cache:warmup').everyFiveMinutes();
    }
}
```

## Best Practices

1. **Use descriptive signatures**: Make commands self-documenting
2. **Provide helpful descriptions**: Users can discover functionality
3. **Validate input**: Check arguments and options before processing
4. **Use progress bars**: For long-running operations
5. **Handle errors gracefully**: Provide meaningful error messages
6. **Log important actions**: Keep audit trails

