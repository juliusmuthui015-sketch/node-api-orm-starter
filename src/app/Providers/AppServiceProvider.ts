import { ServiceProvider, ServiceProviderClass } from '@/eloquent/Providers/ServiceProvider';
import { ReportCacheObserver } from '@/app/Observers/ReportCacheObserver';
import User from '@/app/Models/User/User';
import { Model } from '@/eloquent/Model';
import {DatabaseServiceProvider} from '@/app/Providers/DatabaseServiceProvider';
import {CacheServiceProvider} from '@/app/Providers/CacheServiceProvider';
import {RouteServiceProvider} from "@/app";

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
        RouteServiceProvider
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

        // Register singleton services
        // No domain-specific singleton services in starter template
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
    */
    protected registerObservers(): void {
        const models: Array<typeof Model> = [
            User,
        ];

        for (const model of models) {
            if (typeof (model as typeof Model).observe === 'function') {
                model.observe(ReportCacheObserver);
            }
        }
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
