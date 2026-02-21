import {
    getEventDispatcher,
    EventSubscriber,
    getRegisteredListeners,
    getRegisteredSubscribers,
    ListenerRegistration,
} from '@/eloquent/Core/Events';
import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';

/*
|--------------------------------------------------------------------------
| Event Service Provider
|--------------------------------------------------------------------------
|
| This provider registers all event listeners for the application.
| Events are mapped to their listeners here. It also supports automatic
| discovery of listeners using decorators (@ListensTo, @ShouldQueue).
|
*/

export class EventServiceProvider extends ServiceProvider {
    /**
     * The event to listener mappings for the application.
     * This is for manual registration. Use @ListensTo decorator for auto-discovery.
     */
    protected listen: Record<string, Array<new () => any>> = {
        // Manual registrations can go here
        // Events with @ListensTo decorators are auto-discovered
    };

    /**
     * The subscribers to register.
     * Use @Subscriber decorator for auto-discovery.
     */
    protected subscribe: Array<new () => EventSubscriber> = [
        // Add event subscriber classes here
    ];

    /**
     * Whether to auto-discover listeners from the Listeners directory.
     */
    protected shouldDiscoverEvents: boolean = true;

    /**
     * Register event service.
     */
    register(): void {
        // Nothing to register
    }

    /**
     * Register event listeners.
     */
    async boot(): Promise<void> {
        const dispatcher = getEventDispatcher();

        // Auto-discover listeners and subscribers if enabled
        if (this.shouldDiscoverEvents) {
            await this.discoverListeners();
            await this.discoverSubscribers();
        }

        // Register manual event-listener mappings
        for (const [eventName, listeners] of Object.entries(this.listen)) {
            for (const ListenerClass of listeners) {
                this.registerListener(dispatcher, eventName, ListenerClass);
            }
        }

        // Register listeners discovered via decorators
        for (const [ListenerClass, metadata] of getRegisteredListeners()) {
            for (const eventName of metadata.events) {
                if (metadata.shouldQueue) {
                    // Register as queued listener
                    const registration: ListenerRegistration = {
                        listener: (payload) => new ListenerClass().handle(payload),
                        shouldQueue: true,
                        queueConfig: metadata.queueConfig,
                        listenerClass: ListenerClass,
                        listenerPath: '@/app/Listeners',
                    };
                    dispatcher.listenQueued(eventName, registration);
                } else {
                    this.registerListener(dispatcher, eventName, ListenerClass);
                }
            }
        }

        // Register manual subscribers
        for (const SubscriberClass of this.subscribe) {
            dispatcher.subscribe(SubscriberClass);
        }

        // Register discovered subscribers
        for (const SubscriberClass of getRegisteredSubscribers()) {
            dispatcher.subscribe(SubscriberClass);
        }

        console.log('[EventServiceProvider] Event listeners registered');
    }

    /**
     * Register a single listener for an event.
     */
    private registerListener(
        dispatcher: ReturnType<typeof getEventDispatcher>,
        eventName: string,
        ListenerClass: new () => any
    ): void {
        const listener = new ListenerClass();

        if (typeof listener.handle === 'function') {
            // Check if listener should be queued
            if (listener.shouldQueue) {
                const registration: ListenerRegistration = {
                    listener: (payload) => listener.handle(payload),
                    shouldQueue: true,
                    queueConfig: {
                        connection: listener.connection,
                        queue: listener.queue,
                        delay: listener.delay,
                        tries: listener.tries,
                        timeout: listener.timeout,
                    },
                    listenerClass: ListenerClass,
                    listenerPath: '@/app/Listeners',
                };
                dispatcher.listenQueued(eventName, registration);
            } else {
                dispatcher.listen(eventName, async (payload) => {
                    // Check shouldHandle before executing
                    if (listener.shouldHandle && !listener.shouldHandle(payload)) {
                        return;
                    }

                    try {
                        await listener.handle(payload);
                    } catch (error) {
                        if (listener.failed) {
                            listener.failed(payload, error as Error);
                        }
                        throw error;
                    }
                });
            }
        }
    }

    /**
     * Auto-discover listeners from the listeners directories.
     */
    private async discoverListeners(): Promise<void> {
        try {
            // Import all listeners to trigger decorator registration
            await require('../Listeners');
        } catch (error) {
            console.log('[EventServiceProvider] Could not auto-discover listeners');
        }
    }

    /**
     * Auto-discover subscribers from the subscribers directories.
     */
    private async discoverSubscribers(): Promise<void> {
        try {
            // Import all subscribers to trigger decorator registration
            await require('../Subscribers');
        } catch (error) {
            // Directory might not exist, that's okay
        }
    }

    /**
     * Disable automatic event discovery.
     */
    disableDiscovery(): this {
        this.shouldDiscoverEvents = false;
        return this;
    }

    /**
     * Get all registered events.
     */
    getEvents(): string[] {
        const manualEvents = Object.keys(this.listen);
        const decoratorEvents: string[] = [];

        for (const [, metadata] of getRegisteredListeners()) {
            decoratorEvents.push(...metadata.events);
        }

        return [...new Set([...manualEvents, ...decoratorEvents])];
    }

    /**
     * Get listeners for a specific event.
     */
    getListeners(event: string): Array<new () => any> {
        const manual = this.listen[event] || [];
        const discovered: Array<new () => any> = [];

        for (const [ListenerClass, metadata] of getRegisteredListeners()) {
            if (metadata.events.includes(event)) {
                discovered.push(ListenerClass);
            }
        }

        return [...manual, ...discovered];
    }

    /**
     * Determine if the given event has listeners.
     */
    hasListeners(event: string): boolean {
        return this.getListeners(event).length > 0;
    }
}