import express, { Application as ExpressApp, RequestHandler } from 'express';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import { Container } from '@/eloquent/Container/Container';
import { ServiceProvider, ServiceProviderClass } from '@/eloquent/Providers/ServiceProvider';
import { query as dbQuery } from '@/config/db.config';
import { EventFacadeClass, FakeEventDispatcher, DispatchedEvent } from '@/eloquent/Core/Events';

export class Application {
    private providers: ServiceProvider[] = [];
    private loadedProviders: Map<string, ServiceProvider> = new Map();
    private deferredServices: Map<string, ServiceProviderClass> = new Map();
    private booted = false;
    private expressApp: ExpressApp;

    constructor(public container: Container) {
        this.expressApp = express();
    }

    /*
    |--------------------------------------------------------------------------
    | Service Providers
    |--------------------------------------------------------------------------
    */

    /**
     * Register a service provider with the application.
     */
    register(provider: ServiceProviderClass, force: boolean = false): ServiceProvider {
        // Check if already registered
        const providerName = provider.name;
        if (!force && this.loadedProviders.has(providerName)) {
            return this.loadedProviders.get(providerName)!;
        }

        // Create instance
        const instance = new provider(this);

        // Mark the provider as registered
        this.markAsRegistered(instance);

        // If the application has already booted, boot the provider immediately
        if (this.booted) {
            this.bootProvider(instance);
        }

        return instance;
    }

    /**
     * Mark the given provider as registered.
     */
    protected markAsRegistered(provider: ServiceProvider): void {
        this.providers.push(provider);
        this.loadedProviders.set(provider.constructor.name, provider);

        // Call register method
        provider.register();
    }

    /**
     * Register a deferred provider and service.
     */
    registerDeferredProvider(provider: ServiceProviderClass): void {
        const instance = new provider(this);
        const services = instance.provides();

        for (const service of services) {
            this.deferredServices.set(service, provider);
        }
    }

    /**
     * Load and boot a deferred provider if needed.
     */
    loadDeferredProvider(service: string): void {
        if (!this.deferredServices.has(service)) {
            return;
        }

        const provider = this.deferredServices.get(service)!;

        // Remove from deferred list
        this.deferredServices.delete(service);

        // Register the provider
        this.register(provider);
    }

    /**
     * Resolve a deferred service if it exists.
     */
    make<T>(abstract: string | (new (...args: any[]) => T)): T {
        const key = typeof abstract === 'string' ? abstract : abstract.name;

        // Load deferred provider if needed
        if (this.deferredServices.has(key)) {
            this.loadDeferredProvider(key);
        }

        return this.container.make<T>(abstract);
    }

    /**
     * Boot the application's service providers.
     */
    async boot(): Promise<void> {
        if (this.booted) return;

        // Call booting callbacks on all providers
        for (const provider of this.providers) {
            await provider.callBootingCallbacks();
        }

        // Boot all providers
        for (const provider of this.providers) {
            await this.bootProvider(provider);
        }

        // Call booted callbacks on all providers
        for (const provider of this.providers) {
            await provider.callBootedCallbacks();
        }

        this.booted = true;
    }

    /**
     * Boot the given service provider.
     */
    protected async bootProvider(provider: ServiceProvider): Promise<void> {
        await provider.boot();
    }

    /**
     * Get all registered service providers.
     */
    getProviders(): ServiceProvider[] {
        return this.providers;
    }

    /**
     * Get a specific provider by class name.
     */
    getProvider(providerClass: ServiceProviderClass): ServiceProvider | undefined {
        return this.loadedProviders.get(providerClass.name);
    }

    /**
     * Determine if the application has booted.
     */
    isBooted(): boolean {
        return this.booted;
    }

    /**
     * Get the deferred services and their providers.
     */
    getDeferredServices(): Map<string, ServiceProviderClass> {
        return this.deferredServices;
    }

    /*
    |--------------------------------------------------------------------------
    | Express App Access
    |--------------------------------------------------------------------------
    */

    getExpressApp(): ExpressApp {
        return this.expressApp;
    }

    /*
    |--------------------------------------------------------------------------
    | Middleware Registration
    |--------------------------------------------------------------------------
    */

    useMiddleware(middleware: RequestHandler): void {
        this.expressApp.use(middleware);
    }

    useMiddlewares(middlewares: RequestHandler[]): void {
        for (const middleware of middlewares) {
            this.expressApp.use(middleware);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Route Mounting
    |--------------------------------------------------------------------------
    */

    mountRoutes(prefix: string, router: any): void {
        this.expressApp.use(prefix, router);
    }


    /*
    |--------------------------------------------------------------------------
    | Configure Base Middleware
    |--------------------------------------------------------------------------
    */

    configureBaseMiddleware(): void {
        this.expressApp.use(cors());
        this.expressApp.use(express.json());
        this.expressApp.use(express.urlencoded({ extended: true }));
    }

    /*
    |--------------------------------------------------------------------------
    | Configure Error Handlers
    |--------------------------------------------------------------------------
    */

    configure404Handler(): void {
        this.expressApp.use((req, res) => {
            res.status(404).json({
                success: false,
                message: `Cannot ${req.method} ${req.originalUrl}`,
            });
        });
    }

    configureErrorHandler(handler: RequestHandler): void {
        this.expressApp.use(handler);
    }

    /*
    |--------------------------------------------------------------------------
    | Start Server
    |--------------------------------------------------------------------------
    */

    private httpServer: HttpServer | null = null;

    /**
     * Get the HTTP server instance.
     */
    getHttpServer(): HttpServer | null {
        return this.httpServer;
    }

    /**
     * Create the HTTP server (required for WebSocket support).
     */
    createHttpServer(): HttpServer {
        if (!this.httpServer) {
            this.httpServer = createServer(this.expressApp);
        }
        return this.httpServer;
    }

    listen(port: number | string, callback?: () => void): void {
        // Create HTTP server if not already created
        const server = this.createHttpServer();
        server.listen(port, callback);
    }

    /*
    |--------------------------------------------------------------------------
    | Database Query (for internal use)
    |--------------------------------------------------------------------------
    */

    async query(sql: string, params?: any[]): Promise<any> {
        return dbQuery(sql, params);
    }

    /*
    |--------------------------------------------------------------------------
    | Event Testing Helpers
    |--------------------------------------------------------------------------
    */

    /**
     * Fake events for testing and execute a callback.
     * Events dispatched within the callback will be captured instead of executed.
     *
     * @example
     * const events = await app.withEvents(async () => {
     *     await userService.register(data);
     * });
     * expect(events.some(e => e.eventName === 'user.registered')).toBe(true);
     */
    async withEvents<T>(
        callback: () => T | Promise<T>,
        eventsToFake?: string[]
    ): Promise<{ result: T; events: DispatchedEvent[] }> {
        const fakeDispatcher = EventFacadeClass.fake(eventsToFake);

        try {
            const result = await callback();
            const events = fakeDispatcher.getDispatchedEvents();
            return { result, events };
        } finally {
            EventFacadeClass.restore();
        }
    }

    /**
     * Fake all events for testing.
     * Use Event.assertDispatched() and Event.assertNotDispatched() for assertions.
     *
     * @example
     * app.fakeEvents();
     * await userService.register(data);
     * Event.assertDispatched('user.registered');
     * Event.assertNotDispatched('user.deleted');
     * app.restoreEvents();
     */
    fakeEvents(events?: string[]): FakeEventDispatcher {
        return EventFacadeClass.fake(events);
    }

    /**
     * Restore the original event dispatcher after faking.
     */
    restoreEvents(): void {
        EventFacadeClass.restore();
    }

    /**
     * Get the Event facade for direct access.
     */
    get events(): typeof EventFacadeClass {
        return EventFacadeClass;
    }
}
