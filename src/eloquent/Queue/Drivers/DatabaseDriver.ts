import { QueueDriverInterface, SerializedJob } from '../types';
import queueConfig from '@/config/queue.config';
import QueueJob from "@/eloquent/Queue/Queue/QueueJob";
import FailedJob from "@/eloquent/Queue/Queue/FailedJob";

/*
|--------------------------------------------------------------------------
| Database Queue Driver
|--------------------------------------------------------------------------
|
| This driver stores jobs in a database table using Eloquent models,
| providing persistence and the ability to share the queue across
| multiple servers.
|
*/

export class DatabaseDriver implements QueueDriverInterface {
    private defaultQueue: string;
    private retryAfter: number;

    constructor(config?: { table?: string; queue?: string; retry_after?: number }) {
        const dbConfig = queueConfig.connections.database;
        this.defaultQueue = config?.queue || dbConfig.queue || 'default';
        this.retryAfter = config?.retry_after || dbConfig.retry_after || 90;
    }

    async size(queue: string = this.defaultQueue): Promise<number> {
        return await QueueJob.query()
            .where('queue', queue)
            .count();
    }

    async push(job: SerializedJob, queue: string = this.defaultQueue): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const availableAt = Math.floor(job.availableAt / 1000);

        await QueueJob.create({
            uuid: job.uuid,
            queue: queue,
            payload: JSON.stringify(job),
            attempts: job.attempts,
            available_at: availableAt,
            created_at: now,
        });

        return job.id;
    }

    async later(delay: number, job: SerializedJob, queue: string = this.defaultQueue): Promise<string> {
        job.availableAt = Date.now() + (delay * 1000);
        return this.push(job, queue);
    }

    async pop(queue: string = this.defaultQueue): Promise<SerializedJob | null> {
        const now = Math.floor(Date.now() / 1000);
        const expiredReservation = now - this.retryAfter;

        // Get the next available job - use fresh query each time
        const queueJob = await QueueJob.query()
            .where('queue', queue)
            .where(function(q: any) {
                q.whereNull('reserved_at')
                    .orWhere('reserved_at', '<', expiredReservation);
            })
            .where('available_at', '<=', now)
            .orderBy('id', 'asc')
            .first();

        if (!queueJob) {
            return null;
        }

        // Mark as reserved
        await queueJob.reserve(now);

        const job: SerializedJob = JSON.parse(queueJob.payload);
        job.reservedAt = now * 1000;
        job.attempts = queueJob.attempts;

        // Store the database ID for deletion
        (job as any)._dbId = queueJob.id;

        return job;
    }

    async delete(job: SerializedJob, queue: string = this.defaultQueue): Promise<void> {
        const dbId = (job as any)._dbId;

        if (dbId) {
            await QueueJob.query().where('id', dbId).delete();
        } else {
            await QueueJob.query().where('uuid', job.uuid).delete();
        }
    }

    async release(job: SerializedJob, delay: number, queue: string = this.defaultQueue): Promise<void> {
        const availableAt = Math.floor((Date.now() + (delay * 1000)) / 1000);
        const dbId = (job as any)._dbId;

        job.availableAt = availableAt * 1000;
        job.reservedAt = null;
        const payload = JSON.stringify(job);

        const queueJob = dbId
            ? await QueueJob.find(dbId)
            : await QueueJob.query().where('uuid', job.uuid).first();

        if (queueJob) {
            await queueJob.release(availableAt, payload);
        }
    }

    async clear(queue: string = this.defaultQueue): Promise<number> {
        const count = await this.size(queue);
        await QueueJob.query().where('queue', queue).delete();
        return count;
    }

    async getJobs(queue: string = this.defaultQueue): Promise<SerializedJob[]> {
        const jobs = await QueueJob.query()
            .where('queue', queue)
            .orderBy('id', 'asc')
            .get();

        return jobs.map((job: QueueJob) => JSON.parse(job.payload));
    }

    /*
    |--------------------------------------------------------------------------
    | Failed Jobs Management
    |--------------------------------------------------------------------------
    */

    async logFailed(connection: string, queue: string, job: SerializedJob, exception: Error): Promise<void> {
        await FailedJob.create({
            uuid: job.uuid,
            connection: connection,
            queue: queue,
            payload: JSON.stringify(job),
            exception: exception.stack || exception.message,
        });
    }

    async getFailedJobs(): Promise<any[]> {
        const jobs = await FailedJob.query()
            .orderBy('failed_at', 'desc')
            .get();

        return jobs.map((job: FailedJob) => job.toJSON());
    }

    async retryFailed(uuid: string): Promise<boolean> {
        const failedJob = await FailedJob.query()
            .where('uuid', uuid)
            .first();

        if (!failedJob) {
            return false;
        }

        const job: SerializedJob = JSON.parse(failedJob.payload);

        // Reset attempts
        job.attempts = 0;
        job.reservedAt = null;
        job.availableAt = Date.now();

        await this.push(job, failedJob.queue);
        await this.forgetFailed(uuid);

        return true;
    }

    async forgetFailed(uuid: string): Promise<boolean> {
        const deleted = await FailedJob.query()
            .where('uuid', uuid)
            .delete();

        return deleted > 0;
    }

    async flushFailed(): Promise<number> {
        const count = await FailedJob.query().count();
        await FailedJob.query().delete();
        return count;
    }
}

