import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/app/Http/Middleware/auth';
import authorizeByStatus from '@/app/Http/Middleware/authorizeByStatus';
import throttle from "@/eloquent/Middleware/ThrottleMiddleware";

/**
 * MiddlewareServiceProvider
 *
 * This is an example service provider that demonstrates how to register
 * middleware aliases, groups, and configure middleware in a Laravel-style way.
 *
 * You can create your own middleware service providers by extending ServiceProvider
 * and using the middleware helper methods.
 *
 * @example
 * // In your app.ts or bootstrap
 * app.register(MiddlewareServiceProvider);
 */
export class MiddlewareServiceProvider extends ServiceProvider {
    /**
     * Register any application services.
     *
     * This is where you define middleware aliases and groups.
     * This runs before the boot() method.
     */
    register(): void {
        // Register middleware aliases (short names for middleware)
        this.middlewareAliases({
            'auth': authMiddleware,
            'can': (...perms: string[]) => authorizePermissions(...perms),
            'role': (...roles: string[]) => authorizeRoles(...roles),
            'must-be-active': authorizeByStatus,
            'throttle': throttle
        });

        /*
        |--------------------------------------------------------------------------
        | Web Middleware Group
        |--------------------------------------------------------------------------
        |
        | This middleware group is automatically applied to all routes defined
        | in routes/web.ts. Add session, CSRF, and other web-specific middleware.
        |
        */
        this.middlewareGroup('web', [
            // sessionMiddleware,
            // csrfMiddleware,
        ]);

        /*
        |--------------------------------------------------------------------------
        | API Middleware Group
        |--------------------------------------------------------------------------
        |
        | This middleware group is automatically applied to all routes defined
        | in routes/api.ts. Add throttling, API-specific middleware here.
        |
        */
        this.middlewareGroup('api', ['throttle:120,1'
            // throttleMiddleware,
            // apiResponseMiddleware,
        ]);

        // Set middleware priority (execution order)
        this.middlewarePriority([
            'must-be-active',
            'auth',
            'can',
            'role',
        ]);
    }

    /**
     * Bootstrap any application services.
     *
     * This runs after all providers have been registered.
     * Use this for any middleware configuration that depends on other services.
     */
    boot(): void {
        // You can modify middleware groups here if needed
        // this.appendMiddlewareToGroup('api', someMiddleware);
        // this.prependMiddlewareToGroup('web', securityMiddleware);
    }
}

export default MiddlewareServiceProvider;

