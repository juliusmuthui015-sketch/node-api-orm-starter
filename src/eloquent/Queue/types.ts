/*
|--------------------------------------------------------------------------
| Queue Types and Interfaces
|--------------------------------------------------------------------------
|
| This file contains all the type definitions for the queue system.
|
*/

export interface SerializedJob {
    id: string;
    uuid: string;
    displayName: string;
    job: string;           // Job class name
    data: string;          // JSON serialized payload
    queue: string;
    attempts: number;
    maxTries: number;
    timeout: number;
    backoff: number | number[];
    retryUntil: number | null;
    createdAt: number;
    availableAt: number;
    reservedAt: number | null;
}

export interface FailedJob {
    id: number;
    uuid: string;
    connection: string;
    queue: string;
    payload: string;
    exception: string;
    failedAt: Date;
}

export interface QueueDriverInterface {
    /**
     * Get the size of the queue.
     */
    size(queue?: string): Promise<number>;

    /**
     * Push a new job onto the queue.
     */
    push(job: SerializedJob, queue?: string): Promise<string>;

    /**
     * Push a new job onto the queue after a delay.
     */
    later(delay: number, job: SerializedJob, queue?: string): Promise<string>;

    /**
     * Pop the next job off of the queue.
     */
    pop(queue?: string): Promise<SerializedJob | null>;

    /**
     * Delete a reserved job from the queue.
     */
    delete(job: SerializedJob, queue?: string): Promise<void>;

    /**
     * Release a reserved job back onto the queue.
     */
    release(job: SerializedJob, delay: number, queue?: string): Promise<void>;

    /**
     * Clear all jobs from the queue.
     */
    clear(queue?: string): Promise<number>;

    /**
     * Get all jobs from the queue (for inspection).
     */
    getJobs(queue?: string): Promise<SerializedJob[]>;
}

export interface JobOptions {
    queue?: string;
    connection?: string;
    delay?: number;
    tries?: number;
    timeout?: number;
    backoff?: number | number[];
    retryUntil?: Date;
    uniqueId?: string;
    uniqueFor?: number;
}

export interface ScheduleFrequency {
    expression: string;
    timezone?: string;
}

export interface ScheduledTask {
    name: string;
    command: string | (() => Promise<void>);
    frequency: ScheduleFrequency;
    description?: string;
    withoutOverlapping?: boolean;
    onOneServer?: boolean;
    evenInMaintenanceMode?: boolean;
    lastRun?: Date;
    nextRun?: Date;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'released';

export interface WorkerOptions {
    connection?: string;
    queue?: string | string[];
    delay?: number;
    memory?: number;
    timeout?: number;
    sleep?: number;
    maxTries?: number;
    maxJobs?: number;
    maxTime?: number;
    force?: boolean;
    stopWhenEmpty?: boolean;
    rest?: number;
    verbose?: boolean;
}

export interface JobEvent {
    connectionName: string;
    job: SerializedJob;
}

export interface JobProcessingEvent extends JobEvent {}

export interface JobProcessedEvent extends JobEvent {}

export interface JobFailedEvent extends JobEvent {
    exception: Error;
}

export interface JobExceptionOccurredEvent extends JobEvent {
    exception: Error;
}

