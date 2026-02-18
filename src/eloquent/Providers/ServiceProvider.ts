import { Application } from "@/app/Providers/Application";

export type ServiceProviderClass = new (app: Application) => ServiceProvider;

export abstract class ServiceProvider {
    /*
    |--------------------------------------------------------------------------
    | Service Provider Properties
    |--------------------------------------------------------------------------
    */

    /**
     * All of the registered booting callbacks.
     */
    protected bootingCallbacks: Array<() => void | Promise<void>> = [];

    /**
     * All of the registered booted callbacks.
     */
    protected bootedCallbacks: Array<() => void | Promise<void>> = [];

    constructor(protected app: Application) {}

    /*
    |--------------------------------------------------------------------------
    | Container Access
    |--------------------------------------------------------------------------
    */

    protected get container() {
        return this.app.container;
    }

    /*
    |--------------------------------------------------------------------------
    | Registration Methods
    |--------------------------------------------------------------------------
    */

    /**
     * Register any application services.
     */
    abstract register(): void;

    /**
     * Bootstrap any application services.
     */
    boot(): void | Promise<void> {}

    /*
    |--------------------------------------------------------------------------
    | Provider Registration
    |--------------------------------------------------------------------------
    */

    /**
     * Register another service provider.
     * Similar to Laravel's $this->app->register()
     */
    protected registerProvider(provider: ServiceProviderClass): ServiceProvider {
        return this.app.register(provider);
    }

    /**
     * Register multiple service providers.
     */
    protected registerProviders(providers: ServiceProviderClass[]): void {
        for (const provider of providers) {
            this.registerProvider(provider);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Booting Callbacks
    |--------------------------------------------------------------------------
    */

    /**
     * Register a booting callback to be run before the "boot" method is called.
     */
    booting(callback: () => void | Promise<void>): void {
        this.bootingCallbacks.push(callback);
    }

    /**
     * Register a booted callback to be run after the "boot" method is called.
     */
    booted(callback: () => void | Promise<void>): void {
        this.bootedCallbacks.push(callback);
    }

    /**
     * Call the registered booting callbacks.
     */
    async callBootingCallbacks(): Promise<void> {
        for (const callback of this.bootingCallbacks) {
            await callback();
        }
    }

    /**
     * Call the registered booted callbacks.
     */
    async callBootedCallbacks(): Promise<void> {
        for (const callback of this.bootedCallbacks) {
            await callback();
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Deferred Services
    |--------------------------------------------------------------------------
    */

    /**
     * Get the services provided by the provider.
     * Override this in deferred providers.
     */
    provides(): string[] {
        return [];
    }

    /**
     * Get the events that trigger this service provider to register.
     * Override this for event-based deferred loading.
     */
    when(): string[] {
        return [];
    }

    /**
     * Determine if the provider is deferred.
     */
    isDeferred(): boolean {
        return this.provides().length > 0;
    }
}
