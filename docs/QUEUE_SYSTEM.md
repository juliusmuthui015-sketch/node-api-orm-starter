# Queue Management System

A Laravel-like queue management system for Node.js/TypeScript.

## Features

- **Multiple Queue Drivers**: Sync, Database, and Redis
- **Job Serialization**: Jobs are serialized/deserialized automatically
- **Priority Queues**: Support for multiple queue names with priority processing
- **Retries & Backoff**: Configurable retry attempts with exponential backoff
- **Failed Jobs**: Track and retry failed jobs
- **Task Scheduling**: Cron-based task scheduling like Laravel's scheduler
- **Artisan Commands**: Full CLI support for queue management

## Configuration

Configure your queue in `src/config/queue.config.ts`:

```typescript
const queueConfig = {
    default: 'sync', // or 'database', 'redis'
    
    connections: {
        sync: { driver: 'sync' },
        database: {
            driver: 'database',
            table: 'jobs',
            queue: 'default',
            retry_after: 90,
        },
        redis: {
            driver: 'redis',
            queue: 'default',
            retry_after: 90,
        },
    },
    
    failed: {
        driver: 'database',
        table: 'failed_jobs',
    },
    
    defaults: {
        tries: 3,
        timeout: 60,
        backoff: [1, 5, 10],
        maxExceptions: 1,
    },
};
```

Set the queue driver via environment variable:
```env
QUEUE_CONNECTION=database
```

## Creating Jobs

Create a job in `src/app/Jobs/`:

```typescript
import { Job, Queueable } from '@/eloquent/Queue';

@Queueable()
export class SendEmailJob extends Job {
    // Job configuration
    public queue = 'emails';     // Queue name
    public tries = 3;            // Max attempts
    public timeout = 30;         // Seconds
    public backoff = [10, 30, 60]; // Retry delays

    // Job data
    public to: string = '';
    public subject: string = '';

    // Factory method
    static make(data: { to: string; subject: string }): SendEmailJob {
        const job = new SendEmailJob();
        job.to = data.to;
        job.subject = data.subject;
        return job;
    }

    // Execute the job
    async handle(): Promise<void> {
        console.log(`Sending email to ${this.to}`);
        // ... send email logic
    }

    // Handle failure
    failed(exception: Error): void {
        console.error(`Failed to send email: ${exception.message}`);
    }
}
```

Don't forget to export the job in `src/app/Jobs/index.ts`:
```typescript
export { SendEmailJob } from './SendEmailJob';
```

## Dispatching Jobs

### Basic Dispatch
```typescript
import { SendEmailJob } from '@/app/Jobs';
import { dispatch } from '@/eloquent/Queue';

// Method 1: Using dispatch helper
const job = SendEmailJob.make({ to: 'user@example.com', subject: 'Hello' });
await dispatch(job).dispatch();

// Method 2: Static dispatch
await SendEmailJob.dispatch().onQueue('emails').delay(60).dispatch();
```

### Dispatch Options
```typescript
await dispatch(job)
    .onQueue('emails')        // Specify queue
    .onConnection('redis')    // Specify connection
    .delay(300)               // Delay 5 minutes
    .afterResponse()          // Dispatch after HTTP response
    .dispatch();
```

## Artisan Commands

### Queue Worker
```bash
# Start processing jobs
npm run artisan -- queue:work

# Process specific connection/queue
npm run artisan -- queue:work database --queue=emails,notifications

# Process single job
npm run artisan -- queue:work --once

# With options
npm run artisan -- queue:work --tries=5 --timeout=120 --memory=256
```

### Queue Management
```bash
# View queue status
npm run artisan -- queue:status

# List registered jobs
npm run artisan -- queue:jobs

# Clear queue
npm run artisan -- queue:clear --queue=default

# List failed jobs
npm run artisan -- queue:failed

# Retry failed job
npm run artisan -- queue:retry <uuid>
npm run artisan -- queue:retry all

# Delete failed job
npm run artisan -- queue:forget <uuid>

# Flush all failed jobs
npm run artisan -- queue:flush
```

### Scheduling
```bash
# Run due scheduled tasks once
npm run artisan -- schedule:run

# Start schedule daemon
npm run artisan -- schedule:work

# List scheduled tasks
npm run artisan -- schedule:list
```

## Task Scheduling

Define scheduled tasks in `src/app/Providers/QueueServiceProvider.ts`:

```typescript
protected registerScheduledTasks(): void {
    // Schedule artisan commands
    scheduler.command('cache:clear').daily();
    scheduler.command('invoice:mark-overdue').dailyAt('00:00');
    scheduler.command('invoice:generate').monthlyOn(1, '06:00');

    // Schedule closures
    scheduler.call(async () => {
        console.log('Running cleanup...');
    }).everyFiveMinutes();

    // Schedule jobs
    scheduler.job(GenerateReportJob, 'reports').weekly();
}
```

### Frequency Options
```typescript
.everyMinute()
.everyFiveMinutes()
.everyTenMinutes()
.everyFifteenMinutes()
.everyThirtyMinutes()
.hourly()
.hourlyAt(30)
.daily()
.dailyAt('13:00')
.twiceDaily(1, 13)
.weekly()
.weeklyOn(1, '8:00')  // Monday at 8:00
.monthly()
.monthlyOn(1, '00:00')
.quarterly()
.yearly()
.weekdays()
.weekends()
.sundays() / .mondays() / ... / .saturdays()
.cron('* * * * *')
```

### Task Options
```typescript
scheduler.command('my:command')
    .dailyAt('00:00')
    .name('my-task')
    .description('My scheduled task')
    .withoutOverlapping()
    .runInBackground();
```

## Database Tables

Run migrations to create queue tables:
```bash
npm run artisan -- migrate
```

This creates:
- `jobs` - Pending jobs
- `failed_jobs` - Failed jobs

## Production Deployment

### Running Workers
Use a process manager like PM2:

```bash
# Start worker
pm2 start "npm run queue:work -- --tries=3 --timeout=60" --name queue-worker

# Start scheduler
pm2 start "npm run schedule:work" --name scheduler
```

### Supervisor Configuration
```ini
[program:queue-worker]
command=npm run queue:work -- --tries=3 --timeout=60
directory=/path/to/project
autostart=true
autorestart=true
numprocs=2
process_name=%(program_name)s_%(process_num)02d

[program:scheduler]
command=npm run schedule:work
directory=/path/to/project
autostart=true
autorestart=true
```

## File Structure

```
src/
├── app/
│   ├── Jobs/
│   │   ├── index.ts
│   │   ├── SendEmailJob.ts
│   │   ├── ProcessPaymentJob.ts
│   │   └── GenerateReportJob.ts
│   ├── Models/
│   │   └── Queue/
│   │       ├── index.ts
│   │       ├── QueueJob.ts
│   │       └── FailedJob.ts
│   ├── Providers/
│   │   └── QueueServiceProvider.ts
│   └── Console/
│       └── Commands/
│           └── QueueCommands.ts
├── config/
│   └── queue.config.ts
├── database/
│   └── migrations/
│       └── 20260220100000_create_queue_tables.ts
└── eloquent/
    └── Queue/
        ├── index.ts
        ├── types.ts
        ├── Job.ts
        ├── Queue.ts
        ├── Worker.ts
        ├── Scheduler.ts
        └── Drivers/
            ├── index.ts
            ├── SyncDriver.ts
            ├── DatabaseDriver.ts
            └── RedisDriver.ts
```

