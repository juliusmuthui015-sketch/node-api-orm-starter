import { RequestHandler } from 'express';
import { registerMiddleware } from '@/eloquent/Middleware/middleware';
import { authMiddleware, authorizePermissions, authorizeRoles } from '@/app/Http/Middleware/auth';
import modelRegisterMiddleware from '@/app/Http/Middleware/modelRegister';
import authorizeByStatus from '@/app/Http/Middleware/authorizeByStatus';
import { asyncContextMiddleware } from '@/app/Http/Middleware/asyncContext';
import requestLoggerMiddleware from '@/app/Http/Middleware/requestLogger';
import validatorMiddleware from '@/app/Http/Middleware/validator';
import responseExtenderMiddleware from '@/app/Http/Middleware/responseExtender';
import errorHandler from '@/app/Http/Middleware/errorHandler';
import { Application } from '@/app/Providers/Application';

export type MiddlewareGroup = [string, RequestHandler][];
export type RouteMiddleware = Record<string, RequestHandler | ((...args: string[]) => RequestHandler)>;

export class Kernel {
    protected app: Application;

    constructor(app: Application) {
        this.app = app;
    }

    /*
    |--------------------------------------------------------------------------
    | Global HTTP Middleware
    |--------------------------------------------------------------------------
    |
    | These middleware are run during every request to your application.
    | They are applied before the route middleware.
    |
    */
    protected middleware: RequestHandler[] = [
        asyncContextMiddleware,
        requestLoggerMiddleware,
        validatorMiddleware,
        responseExtenderMiddleware,
        modelRegisterMiddleware,
    ];

    /*
    |--------------------------------------------------------------------------
    | Named Middleware (for route registration)
    |--------------------------------------------------------------------------
    */
    protected namedMiddleware: MiddlewareGroup = [
        ['model-registry', modelRegisterMiddleware],
    ];

    /*
    |--------------------------------------------------------------------------
    | Route Middleware Groups
    |--------------------------------------------------------------------------
    |
    | Define middleware groups that may be assigned to routes and controllers.
    |
    */
    protected middlewareGroups: Record<string, RequestHandler[]> = {
        web: [
            // session middleware
            // csrf middleware
        ],
        api: [
            // throttle middleware
            // api-specific middleware
        ],
    };

    /*
    |--------------------------------------------------------------------------
    | Route Middleware
    |--------------------------------------------------------------------------
    |
    | These middleware may be assigned to route groups or used individually.
    | They are keyed by an alias for convenience.
    |
    */
    protected routeMiddleware: RouteMiddleware = {
        'auth': authMiddleware,
        'can': (...perms: string[]) => authorizePermissions(...perms),
        'role': (...roles: string[]) => authorizeRoles(...roles),
        'must-be-active': authorizeByStatus,
    };

    /*
    |--------------------------------------------------------------------------
    | Middleware Priority
    |--------------------------------------------------------------------------
    |
    | Forces non-global middleware to always run in a specific order.
    |
    */
    protected middlewarePriority: string[] = [
        'auth',
        'must-be-active',
        'can',
        'role',
    ];

    /*
    |--------------------------------------------------------------------------
    | Boot the HTTP Kernel
    |--------------------------------------------------------------------------
    */
    boot(): void {
        // Register global middleware with Express app
        this.app.useMiddlewares(this.middleware);

        // Register named middleware for router
        for (const [name, middleware] of this.namedMiddleware) {
            registerMiddleware(name, middleware as any);
        }

        // Register route middleware aliases
        for (const [name, middleware] of Object.entries(this.routeMiddleware)) {
            registerMiddleware(name, middleware as any);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Configure Error Handling (called after routes are mounted)
    |--------------------------------------------------------------------------
    */
    configureErrorHandling(): void {
        this.app.configure404Handler();
        this.app.configureErrorHandler(errorHandler as any);
    }

    /*
    |--------------------------------------------------------------------------
    | Getters
    |--------------------------------------------------------------------------
    */
    getMiddleware(): RequestHandler[] {
        return this.middleware;
    }

    getMiddlewareGroups(): Record<string, RequestHandler[]> {
        return this.middlewareGroups;
    }

    getRouteMiddleware(): RouteMiddleware {
        return this.routeMiddleware;
    }
}
