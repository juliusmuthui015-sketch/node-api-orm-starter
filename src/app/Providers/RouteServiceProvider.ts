import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';

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
    */
    protected mapApiRoutes(): void {
        // Lazy import routes AFTER middleware has been registered
        const { routesBuilder } = require('@/routes/api');
        // Mount API routes with /api prefix
        this.app.mountRoutes(this.apiPrefix, routesBuilder.build());
    }

    /*
    |--------------------------------------------------------------------------
    | Define the "web" routes for the application
    |--------------------------------------------------------------------------
    */
    protected mapWebRoutes(): void {
        // Lazy import routes AFTER middleware has been registered
        const { webRoutesBuilder } = require('@/routes/web');
        // Mount web routes at root
        this.app.mountRoutes('/', webRoutesBuilder.build());
    }
}
