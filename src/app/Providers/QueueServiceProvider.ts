import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { Queue, QueueManager, scheduler, Schedule } from '@/eloquent/Queue';
import queueConfig from '@/config/queue.config';

// Import jobs to trigger auto-registration via @Queueable decorator
import '@/app/Jobs';

/*
|--------------------------------------------------------------------------
| Queue Service Provider
|--------------------------------------------------------------------------
|
| This service provider registers the queue manager and scheduler
| with the application container.
|
*/

export class QueueServiceProvider extends ServiceProvider {
    /*
    |--------------------------------------------------------------------------
    | Deferred Services
    |--------------------------------------------------------------------------
    */
    protected defer: boolean = false;

    /*
    |--------------------------------------------------------------------------
    | Register Queue Services
    |--------------------------------------------------------------------------
    */
    register(): void {
        // Register the Queue Manager as a singleton
        this.container.singleton(QueueManager, () => Queue);
        this.container.alias(QueueManager, 'queue');

        // Register the Scheduler as a singleton
        this.container.singleton(Schedule, () => scheduler);
        this.container.alias(Schedule, 'schedule');

        // Register queue configuration
        this.container.instance('config.queue', queueConfig);
    }

    /*
    |--------------------------------------------------------------------------
    | Bootstrap Queue Services
    |--------------------------------------------------------------------------
    */
    boot(): void {
        // Register scheduled tasks
        this.registerScheduledTasks();

        // Auto-register jobs from the Jobs directory
        this.registerJobs();
    }

    /*
    |--------------------------------------------------------------------------
    | Register Scheduled Tasks
    |--------------------------------------------------------------------------
    |
    | Define your scheduled tasks here. This method is called during boot.
    |
    */
    protected registerScheduledTasks(): void {
        // Mark overdue invoices daily at midnight
        // scheduler.command('invoice:mark-overdue')
        //     .dailyAt('16:07')
        //     .name('mark-overdue-invoices')
        //     .description('Mark invoices as overdue if their due date has passed');
        //
        // // Generate monthly invoices on the 1st of each month
        // scheduler.command('invoice:generate')
        //     .monthlyOn(1, '06:00')
        //     .name('generate-monthly-invoices')
        //     .description('Generate monthly rent invoices for all active tenants');

        // You can also schedule closures:
        // scheduler.call(async () => {
        //     console.log('Running scheduled task...');
        // }).everyFiveMinutes();
    }

    /*
    |--------------------------------------------------------------------------
    | Register Jobs
    |--------------------------------------------------------------------------
    |
    | Auto-register job classes from the Jobs directory.
    |
    */
    protected registerJobs(): void {
        // Jobs are auto-registered when they use the @Queueable decorator
        // This method can be used to manually register jobs if needed

        try {
            // Dynamic import of jobs - they will self-register via decorator
            // require('@/app/Jobs');
        } catch (e) {
            // Jobs directory might not exist yet
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Services Provided
    |--------------------------------------------------------------------------
    */
    provides(): string[] {
        return ['queue', 'schedule', QueueManager.name, Schedule.name];
    }
}

