import { ServiceProvider, ServiceProviderClass } from '@/eloquent/Providers/ServiceProvider';
import { DatabaseServiceProvider } from '@/app/Providers/DatabaseServiceProvider';
import { CacheServiceProvider } from '@/app/Providers/CacheServiceProvider';
import { RouteServiceProvider } from '@/app';

export class AppServiceProvider extends ServiceProvider {
    /*
    |--------------------------------------------------------------------------
    | Additional Providers to Register
    |--------------------------------------------------------------------------
    |
    | These providers will be registered when this provider is registered.
    | This allows for modular provider organization.
    |
    */
    protected additionalProviders: ServiceProviderClass[] = [
        DatabaseServiceProvider,
        CacheServiceProvider,
        RouteServiceProvider,
        // Add your custom providers here:
        // Example: BillingServiceProvider,
        // Example: NotificationServiceProvider,
    ];

    /*
    |--------------------------------------------------------------------------
    | Register any application services
    |--------------------------------------------------------------------------
    */
    register(): void {
        // Register additional providers
        this.registerProviders(this.additionalProviders);

        // Register your singleton services here:
        // Example: this.container.singleton(MyService);
        // Example: this.container.alias(MyService, 'my-service');
    }

    /*
    |--------------------------------------------------------------------------
    | Bootstrap any application services
    |--------------------------------------------------------------------------
    */
    boot(): void {
        this.registerObservers();
        this.registerLifecycleCallbacks();
    }

    /*
    |--------------------------------------------------------------------------
    | Register Model Observers
    |--------------------------------------------------------------------------
    |
    | Register observers for your models here. Observers allow you to
    | listen for model events like created, updated, deleted, etc.
    |
    */
    protected registerObservers(): void {
        // Example: Register an observer for the User model
        // const models: Array<typeof Model> = [User];
        // for (const model of models) {
        //     if (typeof model.observe === 'function') {
        //         model.observe(YourObserver);
        //     }
        // }
    }

    /*
    |--------------------------------------------------------------------------
    | Register Lifecycle Callbacks
    |--------------------------------------------------------------------------
    */
    protected registerLifecycleCallbacks(): void {
        // Register a callback to run after all providers have booted
        this.booted(() => {
            // This runs after all providers have finished booting
            // Useful for tasks that depend on all services being available
        });
    }
}
