import { createClient, RedisClientType } from 'redis';
import { QueueDriverInterface, SerializedJob } from '../types';
import queueConfig from '@/config/queue.config';

/*
|--------------------------------------------------------------------------
| Redis Queue Driver
|--------------------------------------------------------------------------
|
| This driver uses Redis lists for queue storage, providing high
| performance and real-time job processing capabilities.
|
*/

export class RedisDriver implements QueueDriverInterface {
    private client: RedisClientType | null = null;
    private defaultQueue: string;
    private retryAfter: number;
    private prefix: string;
    private initialized: boolean = false;

    constructor(config?: { queue?: string; retry_after?: number; prefix?: string }) {
        const redisConfig = queueConfig.connections.redis;
        this.defaultQueue = config?.queue || redisConfig.queue || 'default';
        this.retryAfter = config?.retry_after || redisConfig.retry_after || 90;
        this.prefix = config?.prefix || process.env.REDIS_PREFIX || 'rentivo_queue';
    }

    /**
     * Get the Redis key for a queue.
     */
    private getKey(queue: string, suffix: string = ''): string {
        const base = `${this.prefix}:${queue}`;
        return suffix ? `${base}:${suffix}` : base;
    }

    /**
     * Initialize the Redis connection.
     */
    async init(): Promise<void> {
        if (this.initialized && this.client) return;

        try {
            const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

            this.client = createClient({
                url: redisUrl,
                password: process.env.REDIS_PASSWORD || undefined,
            });

            this.client.on('error', (err) => {
                console.error('[RedisDriver] Connection error:', err);
            });

            await this.client.connect();
            this.initialized = true;
        } catch (error) {
            console.error('[RedisDriver] Failed to connect:', error);
            throw error;
        }
    }

    /**
     * Ensure the client is connected.
     */
    private async ensureConnected(): Promise<RedisClientType> {
        if (!this.client || !this.initialized) {
            await this.init();
        }
        return this.client!;
    }

    async size(queue: string = this.defaultQueue): Promise<number> {
        const client = await this.ensureConnected();
        const pending = await client.lLen(this.getKey(queue));
        const delayed = await client.zCard(this.getKey(queue, 'delayed'));
        const reserved = await client.zCard(this.getKey(queue, 'reserved'));
        return pending + delayed + reserved;
    }

    async push(job: SerializedJob, queue: string = this.defaultQueue): Promise<string> {
        const client = await this.ensureConnected();
        const payload = JSON.stringify(job);

        if (job.availableAt > Date.now()) {
            // Job is delayed, add to sorted set
            await client.zAdd(this.getKey(queue, 'delayed'), {
                score: job.availableAt,
                value: payload,
            });
        } else {
            // Job is ready, add to list
            await client.rPush(this.getKey(queue), payload);
        }

        return job.id;
    }

    async later(delay: number, job: SerializedJob, queue: string = this.defaultQueue): Promise<string> {
        job.availableAt = Date.now() + (delay * 1000);
        return this.push(job, queue);
    }

    async pop(queue: string = this.defaultQueue): Promise<SerializedJob | null> {
        const client = await this.ensureConnected();

        // First, migrate delayed jobs that are ready
        await this.migrateDelayedJobs(queue);

        // Also migrate expired reserved jobs
        await this.migrateExpiredReserved(queue);

        // Pop from the queue
        const payload = await client.lPop(this.getKey(queue));

        if (!payload) {
            return null;
        }

        const job: SerializedJob = JSON.parse(payload);
        job.attempts += 1;
        job.reservedAt = Date.now();

        // Add to reserved set
        const reservedPayload = JSON.stringify(job);
        await client.zAdd(this.getKey(queue, 'reserved'), {
            score: Date.now() + (this.retryAfter * 1000),
            value: reservedPayload,
        });

        return job;
    }

    /**
     * Migrate delayed jobs that are ready to be processed.
     */
    private async migrateDelayedJobs(queue: string): Promise<void> {
        const client = await this.ensureConnected();
        const now = Date.now();

        // Get all delayed jobs that are ready
        const jobs = await client.zRangeByScore(
            this.getKey(queue, 'delayed'),
            '-inf',
            now.toString()
        );

        for (const payload of jobs) {
            // Move to main queue
            await client.rPush(this.getKey(queue), payload);
            await client.zRem(this.getKey(queue, 'delayed'), payload);
        }
    }

    /**
     * Migrate expired reserved jobs back to the queue.
     */
    private async migrateExpiredReserved(queue: string): Promise<void> {
        const client = await this.ensureConnected();
        const now = Date.now();

        // Get all reserved jobs that have expired
        const jobs = await client.zRangeByScore(
            this.getKey(queue, 'reserved'),
            '-inf',
            now.toString()
        );

        for (const payload of jobs) {
            // Move back to main queue
            await client.rPush(this.getKey(queue), payload);
            await client.zRem(this.getKey(queue, 'reserved'), payload);
        }
    }

    async delete(job: SerializedJob, queue: string = this.defaultQueue): Promise<void> {
        const client = await this.ensureConnected();

        // Remove from reserved set
        const payload = JSON.stringify(job);
        await client.zRem(this.getKey(queue, 'reserved'), payload);
    }

    async release(job: SerializedJob, delay: number, queue: string = this.defaultQueue): Promise<void> {
        const client = await this.ensureConnected();

        // Remove from reserved set
        const oldPayload = JSON.stringify(job);
        await client.zRem(this.getKey(queue, 'reserved'), oldPayload);

        // Update job
        job.reservedAt = null;
        job.availableAt = Date.now() + (delay * 1000);

        const newPayload = JSON.stringify(job);

        if (delay > 0) {
            // Add to delayed set
            await client.zAdd(this.getKey(queue, 'delayed'), {
                score: job.availableAt,
                value: newPayload,
            });
        } else {
            // Add back to queue
            await client.rPush(this.getKey(queue), newPayload);
        }
    }

    async clear(queue: string = this.defaultQueue): Promise<number> {
        const client = await this.ensureConnected();

        const size = await this.size(queue);

        await client.del(this.getKey(queue));
        await client.del(this.getKey(queue, 'delayed'));
        await client.del(this.getKey(queue, 'reserved'));

        return size;
    }

    async getJobs(queue: string = this.defaultQueue): Promise<SerializedJob[]> {
        const client = await this.ensureConnected();

        const pending = await client.lRange(this.getKey(queue), 0, -1);
        const delayed = await client.zRange(this.getKey(queue, 'delayed'), 0, -1);
        const reserved = await client.zRange(this.getKey(queue, 'reserved'), 0, -1);

        const all = [...pending, ...delayed, ...reserved];
        return all.map(payload => JSON.parse(payload));
    }

    /*
    |--------------------------------------------------------------------------
    | Failed Jobs Management (using separate Redis keys)
    |--------------------------------------------------------------------------
    */

    async logFailed(connection: string, queue: string, job: SerializedJob, exception: Error): Promise<void> {
        const client = await this.ensureConnected();

        const failedJob = {
            uuid: job.uuid,
            connection,
            queue,
            payload: job,
            exception: exception.stack || exception.message,
            failed_at: new Date().toISOString(),
        };

        await client.hSet(
            `${this.prefix}:failed_jobs`,
            job.uuid,
            JSON.stringify(failedJob)
        );
    }

    async getFailedJobs(): Promise<any[]> {
        const client = await this.ensureConnected();

        const jobs = await client.hGetAll(`${this.prefix}:failed_jobs`);
        return Object.values(jobs).map(j => JSON.parse(j));
    }

    async retryFailed(uuid: string): Promise<boolean> {
        const client = await this.ensureConnected();

        const data = await client.hGet(`${this.prefix}:failed_jobs`, uuid);
        if (!data) return false;

        const failedJob = JSON.parse(data);
        const job: SerializedJob = failedJob.payload;

        // Reset attempts
        job.attempts = 0;
        job.reservedAt = null;
        job.availableAt = Date.now();

        await this.push(job, failedJob.queue);
        await this.forgetFailed(uuid);

        return true;
    }

    async forgetFailed(uuid: string): Promise<boolean> {
        const client = await this.ensureConnected();
        const result = await client.hDel(`${this.prefix}:failed_jobs`, uuid);
        return result > 0;
    }

    async flushFailed(): Promise<number> {
        const client = await this.ensureConnected();
        const count = await client.hLen(`${this.prefix}:failed_jobs`);
        await client.del(`${this.prefix}:failed_jobs`);
        return count;
    }

    /**
     * Close the Redis connection.
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this.initialized = false;
        }
    }
}

