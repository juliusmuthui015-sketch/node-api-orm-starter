import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { middlewareStack } from '@/eloquent/Middleware/middleware';

export class RouteServiceProvider extends ServiceProvider {
    /*
    |--------------------------------------------------------------------------
    | The path to the "home" route for your application
    |--------------------------------------------------------------------------
    */
    public static readonly HOME = '/dashboard';

    /*
    |--------------------------------------------------------------------------
    | Route prefix for API routes
    |--------------------------------------------------------------------------
    */
    protected apiPrefix = '/api';

    /*
    |--------------------------------------------------------------------------
    | Register any application services
    |--------------------------------------------------------------------------
    */
    register(): void {
        // Register route bindings if needed
    }

    /*
    |--------------------------------------------------------------------------
    | Define your route model bindings, pattern filters, etc
    |--------------------------------------------------------------------------
    */
    boot(): void {
        this.configureRateLimiting();
        this.mapApiRoutes();
        this.mapWebRoutes();
    }

    /*
    |--------------------------------------------------------------------------
    | Configure the rate limiters for the application
    |--------------------------------------------------------------------------
    */
    protected configureRateLimiting(): void {
        // Configure rate limiting here
        // e.g., RateLimiter.for('api', (request) => Limit.perMinute(60));
    }

    /*
    |--------------------------------------------------------------------------
    | Define the "api" routes for the application
    |--------------------------------------------------------------------------
    |
    | These routes are prefixed with /api and have the "api" middleware
    | group applied to them automatically.
    |
    */
    protected mapApiRoutes(): void {
        // Lazy import routes AFTER middleware has been registered
        const { routesBuilder } = require('@/routes/api');

        // Get the API middleware group
        const apiMiddleware = middlewareStack.getResolvedGroup('api');

        // Get the express app
        const expressApp = this.app.getExpressApp();

        // Apply API middleware group to all /api routes
        if (apiMiddleware.length > 0) {
            expressApp.use(this.apiPrefix, ...apiMiddleware);
        }

        // Mount API routes with /api prefix
        this.app.mountRoutes(this.apiPrefix, routesBuilder.build());
    }

    /*
    |--------------------------------------------------------------------------
    | Define the "web" routes for the application
    |--------------------------------------------------------------------------
    |
    | These routes have the "web" middleware group applied to them
    | automatically.
    |
    */
    protected mapWebRoutes(): void {
        // Lazy import routes AFTER middleware has been registered
        const { webRoutesBuilder } = require('@/routes/web');

        // Get the web middleware group
        const webMiddleware = middlewareStack.getResolvedGroup('web');

        // Get the built routes
        const webRouter = webRoutesBuilder.build();

        // Apply web middleware group to web routes
        if (webMiddleware.length > 0) {
            // We need to apply middleware before the routes
            // Since web routes are at root, we apply to specific paths
            const expressApp = this.app.getExpressApp();

            // Get all registered web route paths and apply middleware
            const webRoutes = webRoutesBuilder.getRoutes();
            for (const route of webRoutes) {
                // Skip if it's a catch-all
                if (route.path !== '*') {
                    expressApp.use(route.path, ...webMiddleware);
                }
            }
        }

        // Mount web routes at root
        this.app.mountRoutes('/', webRouter);
    }
}
