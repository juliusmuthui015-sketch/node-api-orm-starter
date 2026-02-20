import { QueueDriverInterface, SerializedJob } from '../types';

/*
|--------------------------------------------------------------------------
| Sync Queue Driver
|--------------------------------------------------------------------------
|
| This driver executes jobs synchronously, useful for local development
| or when you don't need background processing.
|
*/

export class SyncDriver implements QueueDriverInterface {
    private jobs: Map<string, SerializedJob[]> = new Map();

    async size(queue: string = 'default'): Promise<number> {
        return this.jobs.get(queue)?.length || 0;
    }

    async push(job: SerializedJob, queue: string = 'default'): Promise<string> {
        // For sync driver, we execute immediately
        // But we still need to maintain the queue for inspection
        if (!this.jobs.has(queue)) {
            this.jobs.set(queue, []);
        }

        // Execute the job immediately
        const { Job: JobBase } = await require('../Job');
        const jobInstance = JobBase.deserialize(job);

        if (jobInstance) {
            try {
                await jobInstance.handle();
            } catch (error) {
                console.error(`[Sync] Job ${job.displayName} failed:`, error);
                jobInstance.failed(error as Error);
                throw error;
            }
        }

        return job.id;
    }

    async later(delay: number, job: SerializedJob, queue: string = 'default'): Promise<string> {
        // For sync driver, we execute after the delay using setTimeout
        return new Promise((resolve) => {
            setTimeout(async () => {
                await this.push(job, queue);
                resolve(job.id);
            }, delay * 1000);
        });
    }

    async pop(queue: string = 'default'): Promise<SerializedJob | null> {
        const jobs = this.jobs.get(queue);
        if (!jobs || jobs.length === 0) {
            return null;
        }
        return jobs.shift() || null;
    }

    async delete(job: SerializedJob, queue: string = 'default'): Promise<void> {
        const jobs = this.jobs.get(queue);
        if (jobs) {
            const index = jobs.findIndex(j => j.id === job.id);
            if (index > -1) {
                jobs.splice(index, 1);
            }
        }
    }

    async release(job: SerializedJob, delay: number, queue: string = 'default'): Promise<void> {
        job.availableAt = Date.now() + (delay * 1000);
        job.reservedAt = null;

        if (!this.jobs.has(queue)) {
            this.jobs.set(queue, []);
        }
        this.jobs.get(queue)!.push(job);
    }

    async clear(queue: string = 'default'): Promise<number> {
        const count = this.jobs.get(queue)?.length || 0;
        this.jobs.set(queue, []);
        return count;
    }

    async getJobs(queue: string = 'default'): Promise<SerializedJob[]> {
        return this.jobs.get(queue) || [];
    }
}

