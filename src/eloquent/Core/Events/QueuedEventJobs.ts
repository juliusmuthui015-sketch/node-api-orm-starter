/*
|--------------------------------------------------------------------------
| Call Queued Listener Job
|--------------------------------------------------------------------------
|
| This job is used to dispatch listener execution on the queue.
| When a listener is marked with @ShouldQueue, it will be wrapped
| in this job and dispatched to the queue.
|
*/

import { Job, Queueable } from '@/eloquent/Queue';

@Queueable('CallQueuedListener')
export class CallQueuedListener extends Job {
    /**
     * The listener class name.
     */
    public listenerClass: string;

    /**
     * The event name.
     */
    public eventName: string;

    /**
     * The event payload.
     */
    public payload: any;

    /**
     * The module path to the listener.
     */
    public listenerPath: string;

    constructor(
        listenerClass: string,
        eventName: string,
        payload: any,
        listenerPath: string
    ) {
        super();
        this.listenerClass = listenerClass;
        this.eventName = eventName;
        this.payload = payload;
        this.listenerPath = listenerPath;
    }

    /**
     * Execute the job.
     */
    async handle(): Promise<void> {
        try {
            // Dynamically import the listener module
            const module = await import(this.listenerPath);
            const ListenerClass = module[this.listenerClass];

            if (!ListenerClass) {
                throw new Error(`Listener class [${this.listenerClass}] not found in [${this.listenerPath}]`);
            }

            const listener = new ListenerClass();

            if (typeof listener.handle !== 'function') {
                throw new Error(`Listener [${this.listenerClass}] does not have a handle method`);
            }

            await listener.handle(this.payload);

            console.log(`[CallQueuedListener] Successfully executed ${this.listenerClass} for event ${this.eventName}`);
        } catch (error) {
            console.error(`[CallQueuedListener] Failed to execute ${this.listenerClass}:`, error);
            throw error;
        }
    }

    /**
     * Handle a job failure.
     */
    failed(exception: Error): void {
        console.error(
            `[CallQueuedListener] Listener ${this.listenerClass} failed for event ${this.eventName}:`,
            exception.message
        );
    }

    /**
     * Get the display name of the job.
     */
    displayName(): string {
        return `${this.listenerClass}@handle`;
    }

    /**
     * Get the tags that should be assigned to the job.
     */
    tags(): string[] {
        return [`event:${this.eventName}`, `listener:${this.listenerClass}`];
    }
}

/*
|--------------------------------------------------------------------------
| Call Queued Event Job
|--------------------------------------------------------------------------
|
| This job is used to dispatch event classes that implement ShouldQueue.
| The event itself is serialized and processed asynchronously.
|
*/

@Queueable('CallQueuedEvent')
export class CallQueuedEvent extends Job {
    /**
     * The event class name.
     */
    public eventClass: string;

    /**
     * The serialized event payload.
     */
    public eventPayload: Record<string, any>;

    /**
     * The event name.
     */
    public eventName: string;

    constructor(
        eventClass: string,
        eventName: string,
        eventPayload: Record<string, any>
    ) {
        super();
        this.eventClass = eventClass;
        this.eventName = eventName;
        this.eventPayload = eventPayload;
    }

    /**
     * Execute the job - dispatch the event to its listeners.
     */
    async handle(): Promise<void> {
        const { getEventDispatcher } = await require('@/eloquent/Core/Events');
        const dispatcher = getEventDispatcher();

        // Dispatch the event to all its listeners
        await dispatcher.dispatch(this.eventName, this.eventPayload);

        console.log(`[CallQueuedEvent] Dispatched queued event ${this.eventClass}`);
    }

    /**
     * Handle a job failure.
     */
    failed(exception: Error): void {
        console.error(`[CallQueuedEvent] Failed to dispatch event ${this.eventClass}:`, exception.message);
    }

    /**
     * Get the display name of the job.
     */
    displayName(): string {
        return this.eventClass;
    }

    /**
     * Get the tags that should be assigned to the job.
     */
    tags(): string[] {
        return [`event:${this.eventName}`];
    }
}

