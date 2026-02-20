import { Queue } from './Queue';
import { Job } from './Job';
import { SerializedJob, WorkerOptions, JobStatus } from './types';
import queueConfig from '@/config/queue.config';
import { EventEmitter } from 'events';

/*
|--------------------------------------------------------------------------
| Queue Worker
|--------------------------------------------------------------------------
|
| This class processes jobs from the queue. It can run as a daemon
| or process a single job at a time.
|
*/

export class Worker extends EventEmitter {
    private running: boolean = false;
    private paused: boolean = false;
    private shouldQuit: boolean = false;
    private jobsProcessed: number = 0;
    private startTime: number = 0;
    private currentJob: SerializedJob | null = null;

    private connectionName: string;
    private queues: string[];
    private options: Required<WorkerOptions>;

    constructor(
        connectionName?: string,
        queues: string | string[] = 'default',
        options: WorkerOptions = {}
    ) {
        super();

        this.connectionName = connectionName || queueConfig.default;
        this.queues = Array.isArray(queues) ? queues : [queues];

        this.options = {
            connection: this.connectionName,
            queue: queues,
            delay: options.delay ?? 0,
            memory: options.memory ?? 128,
            timeout: options.timeout ?? queueConfig.defaults.timeout,
            sleep: options.sleep ?? 3,
            maxTries: options.maxTries ?? queueConfig.defaults.tries,
            maxJobs: options.maxJobs ?? 0,
            maxTime: options.maxTime ?? 0,
            force: options.force ?? false,
            stopWhenEmpty: options.stopWhenEmpty ?? false,
            rest: options.rest ?? 0,
            verbose: options.verbose ?? false,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Worker Lifecycle
    |--------------------------------------------------------------------------
    */

    /**
     * Start the worker daemon.
     */
    async daemon(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;
        this.shouldQuit = false;
        this.startTime = Date.now();
        this.jobsProcessed = 0;

        console.log(`[Worker] Starting on connection [${this.connectionName}] processing queues: ${this.queues.join(', ')}`);
        this.emit('worker:start', { connection: this.connectionName, queues: this.queues });

        this.registerSignalHandlers();

        while (this.running && !this.shouldQuit) {
            if (this.paused) {
                await this.sleep(this.options.sleep * 1000);
                continue;
            }

            // Check memory limit
            if (this.memoryExceeded()) {
                console.log('[Worker] Memory limit exceeded, stopping...');
                this.stop();
                break;
            }

            // Check max jobs
            if (this.options.maxJobs > 0 && this.jobsProcessed >= this.options.maxJobs) {
                console.log(`[Worker] Max jobs (${this.options.maxJobs}) reached, stopping...`);
                this.stop();
                break;
            }

            // Check max time
            if (this.options.maxTime > 0) {
                const elapsed = (Date.now() - this.startTime) / 1000;
                if (elapsed >= this.options.maxTime) {
                    console.log(`[Worker] Max time (${this.options.maxTime}s) reached, stopping...`);
                    this.stop();
                    break;
                }
            }

            // Process the next job
            const job = await this.getNextJob();

            if (job) {
                await this.process(job);
                this.jobsProcessed++;

                if (this.options.rest > 0) {
                    await this.sleep(this.options.rest * 1000);
                }
            } else {
                if (this.options.stopWhenEmpty) {
                    console.log('[Worker] Queue is empty, stopping...');
                    this.stop();
                    break;
                }
                await this.sleep(this.options.sleep * 1000);
            }
        }

        this.emit('worker:stop', {
            connection: this.connectionName,
            jobsProcessed: this.jobsProcessed,
            runtime: (Date.now() - this.startTime) / 1000,
        });

        console.log(`[Worker] Stopped. Processed ${this.jobsProcessed} jobs.`);
    }

    /**
     * Process a single job and stop.
     */
    async runNextJob(): Promise<boolean> {
        const job = await this.getNextJob();

        if (!job) {
            return false;
        }

        await this.process(job);
        return true;
    }

    /**
     * Stop the worker.
     */
    stop(): void {
        this.shouldQuit = true;
        this.running = false;
    }

    /**
     * Pause the worker.
     */
    pause(): void {
        this.paused = true;
        this.emit('worker:pause');
    }

    /**
     * Resume the worker.
     */
    resume(): void {
        this.paused = false;
        this.emit('worker:resume');
    }

    /*
    |--------------------------------------------------------------------------
    | Job Processing
    |--------------------------------------------------------------------------
    */

    /**
     * Get the next job from the queues.
     */
    private async getNextJob(): Promise<SerializedJob | null> {
        // Process queues in priority order
        for (const queue of this.queues) {
            try {
                if (this.options.verbose) {
                    console.log(`[Worker] Polling queue [${queue}] on connection [${this.connectionName}]...`);
                }
                const job = await Queue.pop(queue, this.connectionName);
                if (job) {
                    return job;
                }
            } catch (error) {
                console.error(`[Worker] Error popping job from queue [${queue}]:`, error);
            }
        }
        if (this.options.verbose) {
            console.log(`[Worker] No jobs found, sleeping for ${this.options.sleep}s...`);
        }
        return null;
    }

    /**
     * Process a job.
     */
    private async process(serializedJob: SerializedJob): Promise<void> {
        this.currentJob = serializedJob;

        this.emit('job:processing', {
            connectionName: this.connectionName,
            job: serializedJob
        });

        console.log(`[Worker] Processing job: ${serializedJob.displayName} (${serializedJob.uuid})`);

        try {
            // Deserialize and execute the job
            const job = Job.deserialize(serializedJob);

            if (!job) {
                throw new Error(`Failed to deserialize job: ${serializedJob.job}`);
            }

            // Create a timeout promise
            const timeoutMs = (serializedJob.timeout || this.options.timeout) * 1000;
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Job timed out')), timeoutMs);
            });

            // Race between job execution and timeout
            await Promise.race([
                job.handle(),
                timeoutPromise,
            ]);

            // Job completed successfully
            await this.handleSuccess(serializedJob);

        } catch (error) {
            await this.handleFailure(serializedJob, error as Error);
        } finally {
            this.currentJob = null;
        }
    }

    /**
     * Handle a successful job.
     */
    private async handleSuccess(job: SerializedJob): Promise<void> {
        // Delete the job from the queue
        const driver = Queue.connection(this.connectionName);
        await driver.delete(job, job.queue);

        this.emit('job:processed', {
            connectionName: this.connectionName,
            job
        });

        console.log(`[Worker] Job completed: ${job.displayName} (${job.uuid})`);
    }

    /**
     * Handle a failed job.
     */
    private async handleFailure(job: SerializedJob, error: Error): Promise<void> {
        console.error(`[Worker] Job failed: ${job.displayName} (${job.uuid})`, error.message);

        this.emit('job:exception', {
            connectionName: this.connectionName,
            job,
            exception: error
        });

        const maxTries = job.maxTries || this.options.maxTries;
        const driver = Queue.connection(this.connectionName);

        // Check if we should retry
        if (job.attempts < maxTries) {
            // Calculate backoff delay
            const delay = this.calculateBackoff(job);

            console.log(`[Worker] Releasing job for retry (attempt ${job.attempts}/${maxTries}) in ${delay}s`);

            await driver.release(job, delay, job.queue);
        } else {
            // Max attempts reached, mark as failed
            console.log(`[Worker] Job failed permanently after ${job.attempts} attempts`);

            // Delete from queue
            await driver.delete(job, job.queue);

            // Log to failed jobs
            await Queue.logFailed(this.connectionName, job.queue, job, error);

            // Call the job's failed method
            const jobInstance = Job.deserialize(job);
            if (jobInstance) {
                try {
                    jobInstance.failed(error);
                } catch (e) {
                    console.error('[Worker] Error in job.failed():', e);
                }
            }

            this.emit('job:failed', {
                connectionName: this.connectionName,
                job,
                exception: error
            });
        }
    }

    /**
     * Calculate the backoff delay for a job.
     */
    private calculateBackoff(job: SerializedJob): number {
        const backoff = job.backoff || queueConfig.defaults.backoff;

        if (typeof backoff === 'number') {
            return backoff;
        }

        if (Array.isArray(backoff)) {
            const index = Math.min(job.attempts - 1, backoff.length - 1);
            return backoff[index];
        }

        return 0;
    }

    /*
    |--------------------------------------------------------------------------
    | Utilities
    |--------------------------------------------------------------------------
    */

    /**
     * Check if memory limit is exceeded.
     */
    private memoryExceeded(): boolean {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        return used >= this.options.memory;
    }

    /**
     * Sleep for the given milliseconds.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Register signal handlers for graceful shutdown.
     */
    private registerSignalHandlers(): void {
        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

        for (const signal of signals) {
            process.on(signal, () => {
                console.log(`\n[Worker] Received ${signal}, stopping gracefully...`);
                this.stop();
            });
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    isRunning(): boolean {
        return this.running;
    }

    isPaused(): boolean {
        return this.paused;
    }

    getJobsProcessed(): number {
        return this.jobsProcessed;
    }

    getCurrentJob(): SerializedJob | null {
        return this.currentJob;
    }

    getRuntime(): number {
        return this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
    }

    getStatus(): {
        running: boolean;
        paused: boolean;
        jobsProcessed: number;
        runtime: number;
        currentJob: SerializedJob | null;
        memory: number;
    } {
        return {
            running: this.running,
            paused: this.paused,
            jobsProcessed: this.jobsProcessed,
            runtime: this.getRuntime(),
            currentJob: this.currentJob,
            memory: process.memoryUsage().heapUsed / 1024 / 1024,
        };
    }
}

