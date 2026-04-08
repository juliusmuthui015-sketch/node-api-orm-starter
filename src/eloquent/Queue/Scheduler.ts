import { EventEmitter } from 'events';
import parser from 'cron-parser';
import {Event as EloquentEvent, Listener, ListensTo, getEventDispatcher} from '@/eloquent/Core/Events';
import { Cache } from '@/cache';

/*
|--------------------------------------------------------------------------
| Distributed Lock Helpers
|--------------------------------------------------------------------------
|
| Used by onOneServer / withoutOverlapping to ensure only one
| instance of a scheduled task runs across all servers sharing
| the same cache (Redis / DB).
|
*/

const SCHEDULER_LOCK_PREFIX = `${process.env.APP_NAME || 'app'}:scheduler:lock`;

async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const lockKey = `${SCHEDULER_LOCK_PREFIX}:${key}`;
    const existing = await Cache.get(lockKey);
    if (existing) return false; // lock held by another instance
    await Cache.set(lockKey, Date.now(), ttlSeconds);
    return true;
}

async function releaseLock(key: string): Promise<void> {
    const lockKey = `${SCHEDULER_LOCK_PREFIX}:${key}`;
    await Cache.del(lockKey);
}

/*
|--------------------------------------------------------------------------
| Task Scheduler
|--------------------------------------------------------------------------
|
| This class provides Laravel-like task scheduling functionality
| using cron expressions.
|
*/

export interface ScheduledTask {
    name: string;
    callback: () => Promise<void> | void;
    expression: string;
    timezone?: string;
    description?: string;
    withoutOverlapping: boolean;
    onOneServer: boolean;
    evenInMaintenanceMode: boolean;
    runInBackground: boolean;
    lastRun?: Date;
    nextRun?: Date;
    isRunning: boolean;
}


export function createObservableTask(task: ScheduledTask): ScheduledTask {
    return new Proxy(task, {
        set(target, prop, value) {
            if (prop === 'expression' && target.expression !== value) {
                target.expression = value;
                // Calculate nextRun synchronously when expression changes
                try {
                    const interval = parser.parse(value, {
                        tz: target.timezone || 'UTC',
                    });
                    target.nextRun = interval.next().toDate();
                } catch (e) {
                    // Invalid cron expression, leave nextRun undefined
                }

                // 🔥 fire event
                new TaskExpressionChangedEvent(target).dispatchNow();


                return true;
            }

            (target as any)[prop] = value;
            return true;
        }
    });
}
export class Schedule {
    private tasks: ScheduledTask[] = [];
    private running: boolean = false;
    private events: EventEmitter = new EventEmitter();

    /*
    |--------------------------------------------------------------------------
    | Task Definition Methods
    |--------------------------------------------------------------------------
    */

    /**
     * Add a new scheduled task.
     */
    call(callback: () => Promise<void> | void): ScheduledTaskBuilder {
        const task: ScheduledTask = createObservableTask({
            name: `closure-${Date.now()}`,
            callback,
            expression: '* * * * *',
            withoutOverlapping: false,
            onOneServer: false,
            evenInMaintenanceMode: false,
            runInBackground: false,
            isRunning: false,
        });

        this.tasks.push(task);
        return new ScheduledTaskBuilder(task);
    }

    /**
     * Schedule an artisan command.
     */
    command(command: string, args: string[] = []): ScheduledTaskBuilder {
        const callback = async () => {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            const fullCommand = `npm run artisan -- ${command} ${args.join(' ')}`;
            console.log(`[Scheduler] Running command: ${fullCommand}`);

            try {
                const { stdout, stderr } = await execAsync(fullCommand);
                if (stdout) console.log(stdout);
                if (stderr) console.error(stderr);
            } catch (error) {
                console.error(`[Scheduler] Command failed:`, error);
                throw error;
            }
        };

        const task: ScheduledTask = createObservableTask({
            name: `command:${command}`,
            callback,
            expression: '* * * * *',
            description: `Artisan command: ${command}`,
            withoutOverlapping: false,
            onOneServer: false,
            evenInMaintenanceMode: false,
            runInBackground: false,
            isRunning: false,
        });

        this.tasks.push(task);
        return new ScheduledTaskBuilder(task);
    }

    updateNextTaskRun(task: ScheduledTask) {
        const interval = parser.parse(task.expression, {
            tz: task.timezone || 'UTC',
        });

        task.nextRun = interval.next().toDate();
    }

    /**
     * Schedule a shell command.
     */
    exec(command: string): ScheduledTaskBuilder {
        const callback = async () => {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            console.log(`[Scheduler] Executing: ${command}`);

            try {
                const { stdout, stderr } = await execAsync(command);
                if (stdout) console.log(stdout);
                if (stderr) console.error(stderr);
            } catch (error) {
                console.error(`[Scheduler] Execution failed:`, error);
                throw error;
            }
        };

        const task: ScheduledTask = createObservableTask({
            name: `exec:${command.slice(0, 50)}`,
            callback,
            expression: '* * * * *',
            description: `Shell command: ${command}`,
            withoutOverlapping: false,
            onOneServer: false,
            evenInMaintenanceMode: false,
            runInBackground: false,
            isRunning: false,
        });

        this.tasks.push(task);
        return new ScheduledTaskBuilder(task);
    }

    /**
     * Schedule a job to be dispatched.
     */
    job<T extends { dispatch: () => { dispatch: () => Promise<string> } }>(
        JobClass: T,
        queue?: string
    ): ScheduledTaskBuilder {
        const callback = async () => {
            const pending = JobClass.dispatch();
            if (queue) {
                (pending as any).onQueue(queue);
            }
            await pending.dispatch();
        };

        const task: ScheduledTask = createObservableTask({
            name: `job:${(JobClass as any).name || 'anonymous'}`,
            callback,
            expression: '* * * * *',
            description: `Dispatch job: ${(JobClass as any).name}`,
            withoutOverlapping: false,
            onOneServer: false,
            evenInMaintenanceMode: false,
            runInBackground: false,
            isRunning: false,
        });

        this.tasks.push(task);
        return new ScheduledTaskBuilder(task);
    }

    /*
    |--------------------------------------------------------------------------
    | Scheduler Execution
    |--------------------------------------------------------------------------
    */

    /**
     * Get all scheduled tasks.
     */
    getTasks(): ScheduledTask[] {
        return this.tasks;
    }

    /**
     * Get tasks that are due to run.
     */
    getDueTasks(): ScheduledTask[] {
        const now = new Date();
        return this.tasks.filter(task => this.isDue(task, now));
    }

    /**
     * Check if a task is due to run.
     */
    private isDue(task: ScheduledTask, now: Date = new Date()): boolean {
        return this.matchesCronExpression(task.expression, now);
    }

    /**
     * Match a cron expression against a date.
     */
    private matchesCronExpression(expression: string, date: Date): boolean {
        const parts = expression.split(' ');
        if (parts.length !== 5) {
            console.warn(`[Scheduler] Invalid cron expression: ${expression}`);
            return false;
        }

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        return (
            this.matchCronPart(minute, date.getMinutes()) &&
            this.matchCronPart(hour, date.getHours()) &&
            this.matchCronPart(dayOfMonth, date.getDate()) &&
            this.matchCronPart(month, date.getMonth() + 1) &&
            this.matchCronPart(dayOfWeek, date.getDay())
        );
    }

    /**
     * Match a single cron part.
     */
    private matchCronPart(pattern: string, value: number): boolean {
        if (pattern === '*') return true;

        // Handle */n (every n)
        if (pattern.startsWith('*/')) {
            const interval = parseInt(pattern.slice(2), 10);
            return value % interval === 0;
        }

        // Handle ranges (e.g., 1-5)
        if (pattern.includes('-')) {
            const [start, end] = pattern.split('-').map(n => parseInt(n, 10));
            return value >= start && value <= end;
        }

        // Handle lists (e.g., 1,3,5)
        if (pattern.includes(',')) {
            const values = pattern.split(',').map(n => parseInt(n, 10));
            return values.includes(value);
        }

        // Exact match
        return parseInt(pattern, 10) === value;
    }

    /**
     * Run the scheduler once (check and execute due tasks).
     */
    async runDueTasks(): Promise<void> {
        const dueTasks = this.getDueTasks();

        console.log(`[Scheduler] Found ${dueTasks.length} due task(s)`);

        for (const task of dueTasks) {
            // Skip if task is already running and withoutOverlapping is enabled
            if (task.withoutOverlapping && task.isRunning) {
                console.log(`[Scheduler] Skipping overlapping task (in-memory): ${task.name}`);
                continue;
            }

            // Distributed withoutOverlapping check via cache lock
            if (task.withoutOverlapping) {
                const lockAcquired = await acquireLock(`overlap:${task.name}`, 300).catch(() => false);
                if (!lockAcquired) {
                    console.log(`[Scheduler] Skipping overlapping task (distributed lock): ${task.name}`);
                    continue;
                }
            }

            // Distributed onOneServer check via cache lock
            if (task.onOneServer) {
                // Lock for ~60 seconds (one cron tick) so only one server picks it up
                const lockAcquired = await acquireLock(`once:${task.name}:${Math.floor(Date.now() / 60000)}`, 65).catch(() => false);
                if (!lockAcquired) {
                    console.log(`[Scheduler] Skipping task (onOneServer, another instance has it): ${task.name}`);
                    continue;
                }
            }

            await this.runTask(task);
        }
    }

    /**
     * Run a single task.
     */
    private async runTask(task: ScheduledTask): Promise<void> {
        task.isRunning = true;
        task.lastRun = new Date();
        this.updateNextTaskRun(task)

        console.log(`[Scheduler] Running task: ${task.name}`);
        this.events.emit('task:start', task);

        try {
            if (task.runInBackground) {
                // Run in background without waiting
                setImmediate(async () => {
                    try {
                        await task.callback();
                        this.events.emit('task:success', task);
                    } catch (error) {
                        this.events.emit('task:failed', task, error);
                    } finally {
                        task.isRunning = false;
                        if (task.withoutOverlapping) {
                            await releaseLock(`overlap:${task.name}`).catch(() => {});
                        }
                    }
                });
            } else {
                await task.callback();
                this.events.emit('task:success', task);
            }
        } catch (error) {
            console.error(`[Scheduler] Task failed: ${task.name}`, error);
            this.events.emit('task:failed', task, error);
        } finally {
            if (!task.runInBackground) {
                task.isRunning = false;
                if (task.withoutOverlapping) {
                    await releaseLock(`overlap:${task.name}`).catch(() => {});
                }
            }
        }
    }

    /**
     * Start the scheduler daemon (runs every minute).
     */
    async start(): Promise<void> {
        if (this.running) {
            console.log('[Scheduler] Already running');
            return;
        }

        this.running = true;
        console.log('[Scheduler] Starting scheduler daemon...');

        // Run immediately, then every minute
        await this.runDueTasks();

        while (this.running) {
            // Wait until the start of the next minute
            const now = new Date();
            const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

            await this.sleep(msUntilNextMinute);

            if (this.running) {
                await this.runDueTasks();
            }
        }
    }

    /**
     * Stop the scheduler daemon.
     */
    stop(): void {
        this.running = false;
        console.log('[Scheduler] Stopping scheduler daemon...');
    }

    /**
     * Check if the scheduler is running.
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Sleep utility.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /*
    |--------------------------------------------------------------------------
    | Event Listeners
    |--------------------------------------------------------------------------
    */

    on(event: 'task:start' | 'task:success' | 'task:failed', listener: (task: ScheduledTask, error?: any) => void): void {
        this.events.on(event, listener);
    }
}

/*
|--------------------------------------------------------------------------
| Scheduled Task Builder
|--------------------------------------------------------------------------
|
| Provides a fluent interface for configuring scheduled tasks.
|
*/

export class TaskExpressionChangedEvent extends EloquentEvent{
    constructor(public readonly task: ScheduledTask) {
        super();
    }

    eventName(): string {
        return 'task:expression-changed';
    }
}

@ListensTo(['task:expression-changed'])
export class TaskExpressionChangedListener extends Listener {
    handle(payload: TaskExpressionChangedEvent): void | Promise<void> {
        const task = payload.task;

        const interval = parser.parse(task.expression, {
            tz: task.timezone || 'UTC',
        });

        task.nextRun = interval.next().toDate();
    }

}

export class ScheduledTaskBuilder {
    constructor(private task: ScheduledTask) {
        // this.task = createObservableTask(this.task);
    }

    /*
    |--------------------------------------------------------------------------
    | Frequency Methods
    |--------------------------------------------------------------------------
    */

    /**
     * Set the cron expression.
     */
    cron(expression: string): this {
        this.task.expression = expression;
        return this;
    }

    /**
     * Run every minute.
     */
    everyMinute(): this {
        this.task.expression = '* * * * *';
        return this;
    }

    /**
     * Run every two minutes.
     */
    everyTwoMinutes(): this {
        this.task.expression = '*/2 * * * *';
        return this;
    }

    /**
     * Run every five minutes.
     */
    everyFiveMinutes(): this {
        this.task.expression = '*/5 * * * *';
        return this;
    }

    /**
     * Run every ten minutes.
     */
    everyTenMinutes(): this {
        this.task.expression = '*/10 * * * *';
        return this;
    }

    /**
     * Run every fifteen minutes.
     */
    everyFifteenMinutes(): this {
        this.task.expression = '*/15 * * * *';
        return this;
    }

    /**
     * Run every thirty minutes.
     */
    everyThirtyMinutes(): this {
        this.task.expression = '*/30 * * * *';
        return this;
    }

    /**
     * Run hourly.
     */
    hourly(): this {
        this.task.expression = '0 * * * *';
        return this;
    }

    /**
     * Run hourly at a specific minute.
     */
    hourlyAt(minute: number): this {
        this.task.expression = `${minute} * * * *`;
        return this;
    }

    /**
     * Run every two hours.
     */
    everyTwoHours(): this {
        this.task.expression = '0 */2 * * *';
        return this;
    }

    /**
     * Run every four hours.
     */
    everyFourHours(): this {
        this.task.expression = '0 */4 * * *';
        return this;
    }

    /**
     * Run every six hours.
     */
    everySixHours(): this {
        this.task.expression = '0 */6 * * *';
        return this;
    }

    /**
     * Run daily at midnight.
     */
    daily(): this {
        this.task.expression = '0 0 * * *';
        return this;
    }

    /**
     * Run daily at a specific time.
     */
    dailyAt(time: string): this {
        const [hour, minute] = time.split(':').map(n => parseInt(n, 10));
        this.task.expression = `${minute || 0} ${hour} * * *`;
        return this;
    }

    /**
     * Run twice daily.
     */
    twiceDaily(firstHour: number = 1, secondHour: number = 13): this {
        this.task.expression = `0 ${firstHour},${secondHour} * * *`;
        return this;
    }

    /**
     * Run weekly on Sunday at midnight.
     */
    weekly(): this {
        this.task.expression = '0 0 * * 0';
        return this;
    }

    /**
     * Run weekly on a specific day and time.
     */
    weeklyOn(dayOfWeek: number, time: string = '0:0'): this {
        const [hour, minute] = time.split(':').map(n => parseInt(n, 10));
        this.task.expression = `${minute || 0} ${hour} * * ${dayOfWeek}`;
        return this;
    }

    /**
     * Run monthly on the first day at midnight.
     */
    monthly(): this {
        this.task.expression = '0 0 1 * *';
        return this;
    }

    /**
     * Run monthly on a specific day and time.
     */
    monthlyOn(day: number, time: string = '0:0'): this {
        const [hour, minute] = time.split(':').map(n => parseInt(n, 10));
        this.task.expression = `${minute || 0} ${hour} ${day} * *`;
        return this;
    }

    /**
     * Run quarterly.
     */
    quarterly(): this {
        this.task.expression = '0 0 1 1,4,7,10 *';
        return this;
    }

    /**
     * Run yearly.
     */
    yearly(): this {
        this.task.expression = '0 0 1 1 *';
        return this;
    }

    /**
     * Run on weekdays only.
     */
    weekdays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '1-5';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on weekends only.
     */
    weekends(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '0,6';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Sundays.
     */
    sundays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '0';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Mondays.
     */
    mondays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '1';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Tuesdays.
     */
    tuesdays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '2';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Wednesdays.
     */
    wednesdays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '3';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Thursdays.
     */
    thursdays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '4';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Fridays.
     */
    fridays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '5';
        this.task.expression = parts.join(' ');
        return this;
    }

    /**
     * Run on Saturdays.
     */
    saturdays(): this {
        const parts = this.task.expression.split(' ');
        parts[4] = '6';
        this.task.expression = parts.join(' ');
        return this;
    }

    /*
    |--------------------------------------------------------------------------
    | Configuration Methods
    |--------------------------------------------------------------------------
    */

    /**
     * Set the task name.
     */
    name(name: string): this {
        this.task.name = name;
        return this;
    }

    /**
     * Set the task description.
     */
    description(description: string): this {
        this.task.description = description;
        return this;
    }

    /**
     * Prevent task overlapping.
     */
    withoutOverlapping(): this {
        this.task.withoutOverlapping = true;
        return this;
    }

    /**
     * Run on one server only (for distributed systems).
     */
    onOneServer(): this {
        this.task.onOneServer = true;
        return this;
    }

    /**
     * Run even in maintenance mode.
     */
    evenInMaintenanceMode(): this {
        this.task.evenInMaintenanceMode = true;
        return this;
    }

    /**
     * Run in background.
     */
    runInBackground(): this {
        this.task.runInBackground = true;
        return this;
    }

    /**
     * Set timezone.
     */
    timezone(timezone: string): this {
        this.task.timezone = timezone;
        return this;
    }
}

// Export a singleton instance
export const scheduler = new Schedule();

// Register the TaskExpressionChangedListener immediately so it's available
// before any tasks are created (decorators only register metadata, not the actual listener)
getEventDispatcher().listen('task:expression-changed', (payload: TaskExpressionChangedEvent) => {
    new TaskExpressionChangedListener().handle(payload);
});

