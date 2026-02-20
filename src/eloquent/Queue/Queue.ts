import { QueueDriverInterface, SerializedJob } from './types';
import { SyncDriver, DatabaseDriver, RedisDriver } from './Drivers';
import { Job } from './Job';
import queueConfig from '@/config/queue.config';

/*
|--------------------------------------------------------------------------
| Queue Manager
|--------------------------------------------------------------------------
|
| This class manages queue connections and provides a unified interface
| for dispatching jobs to different queue backends.
|
*/

class QueueManager {
    private connections: Map<string, QueueDriverInterface> = new Map();
    private defaultConnection: string;

    constructor() {
        this.defaultConnection = queueConfig.default;
    }

    /*
    |--------------------------------------------------------------------------
    | Connection Management
    |--------------------------------------------------------------------------
    */

    /**
     * Get a queue connection instance.
     * For Redis, we cache the connection to reuse the same client.
     * For Database, we create fresh instances to ensure queries aren't cached.
     */
    connection(name?: string): QueueDriverInterface {
        const connectionName = name || this.defaultConnection;
        const config = queueConfig.connections[connectionName];

        if (!config) {
            throw new Error(`Queue connection [${connectionName}] is not defined.`);
        }

        // For Redis, cache the connection to maintain persistent connection
        if (config.driver === 'redis') {
            if (!this.connections.has(connectionName)) {
                this.connections.set(connectionName, this.resolve(connectionName));
            }
            return this.connections.get(connectionName)!;
        }

        // For other drivers (database, sync), create fresh instance
        // This ensures database queries are not cached
        return this.resolve(connectionName);
    }

    /**
     * Resolve a queue connection instance.
     */
    private resolve(name: string): QueueDriverInterface {
        const config = queueConfig.connections[name];

        if (!config) {
            throw new Error(`Queue connection [${name}] is not defined.`);
        }

        switch (config.driver) {
            case 'sync':
                return new SyncDriver();
            case 'database':
                return new DatabaseDriver({
                    table: config.table,
                    queue: config.queue,
                    retry_after: config.retry_after,
                });
            case 'redis':
                return new RedisDriver({
                    queue: config.queue,
                    retry_after: config.retry_after,
                });
            default:
                throw new Error(`Queue driver [${config.driver}] is not supported.`);
        }
    }

    /**
     * Get the default connection name.
     */
    getDefaultDriver(): string {
        return this.defaultConnection;
    }

    /**
     * Set the default connection name.
     */
    setDefaultDriver(name: string): void {
        this.defaultConnection = name;
    }

    /*
    |--------------------------------------------------------------------------
    | Queue Operations
    |--------------------------------------------------------------------------
    */

    /**
     * Push a new job onto the queue.
     */
    async push(job: Job, queue?: string): Promise<string> {
        const serialized = job.serialize();
        const connection = this.connection(job.connection);
        const queueName = queue || job.queue;

        if (job.delay > 0) {
            return connection.later(job.delay, serialized, queueName);
        }

        return connection.push(serialized, queueName);
    }

    /**
     * Push a new job onto the queue after a delay.
     */
    async later(delay: number, job: Job, queue?: string): Promise<string> {
        job.withDelay(delay);
        return this.push(job, queue);
    }

    /**
     * Push a raw payload onto the queue.
     */
    async pushRaw(payload: SerializedJob, queue?: string, connection?: string): Promise<string> {
        return this.connection(connection).push(payload, queue);
    }

    /**
     * Push multiple jobs onto the queue.
     */
    async bulk(jobs: Job[], queue?: string): Promise<string[]> {
        const results: string[] = [];

        for (const job of jobs) {
            const id = await this.push(job, queue);
            results.push(id);
        }

        return results;
    }

    /**
     * Pop the next job from the queue.
     */
    async pop(queue?: string, connection?: string): Promise<SerializedJob | null> {
        return this.connection(connection).pop(queue);
    }

    /**
     * Get the size of the queue.
     */
    async size(queue?: string, connection?: string): Promise<number> {
        return this.connection(connection).size(queue);
    }

    /**
     * Clear all jobs from the queue.
     */
    async clear(queue?: string, connection?: string): Promise<number> {
        return this.connection(connection).clear(queue);
    }

    /**
     * Get all jobs from a queue.
     */
    async getJobs(queue?: string, connection?: string): Promise<SerializedJob[]> {
        return this.connection(connection).getJobs(queue);
    }

    /*
    |--------------------------------------------------------------------------
    | Failed Jobs
    |--------------------------------------------------------------------------
    */

    /**
     * Log a failed job.
     */
    async logFailed(connectionName: string, queue: string, job: SerializedJob, exception: Error): Promise<void> {
        const driver = this.connection(connectionName);

        if ('logFailed' in driver) {
            await (driver as any).logFailed(connectionName, queue, job, exception);
        }
    }

    /**
     * Get all failed jobs.
     */
    async getFailedJobs(connection?: string): Promise<any[]> {
        const driver = this.connection(connection);

        if ('getFailedJobs' in driver) {
            return (driver as any).getFailedJobs();
        }

        return [];
    }

    /**
     * Retry a failed job.
     */
    async retryFailed(uuid: string, connection?: string): Promise<boolean> {
        const driver = this.connection(connection);

        if ('retryFailed' in driver) {
            return (driver as any).retryFailed(uuid);
        }

        return false;
    }

    /**
     * Delete a failed job.
     */
    async forgetFailed(uuid: string, connection?: string): Promise<boolean> {
        const driver = this.connection(connection);

        if ('forgetFailed' in driver) {
            return (driver as any).forgetFailed(uuid);
        }

        return false;
    }

    /**
     * Delete all failed jobs.
     */
    async flushFailed(connection?: string): Promise<number> {
        const driver = this.connection(connection);

        if ('flushFailed' in driver) {
            return (driver as any).flushFailed();
        }

        return 0;
    }
}

// Export a singleton instance
export const Queue = new QueueManager();

// Also export the class for testing
export { QueueManager };

