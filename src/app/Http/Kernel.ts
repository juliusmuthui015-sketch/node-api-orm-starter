import { RequestHandler } from 'express';
import { registerMiddleware, middlewareStack, MiddlewareStack, Middleware, MiddlewareEntry } from '@/eloquent/Middleware/middleware';
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
        // 'auth': authMiddleware,
        // 'can': (...perms: string[]) => authorizePermissions(...perms),
        // 'role': (...roles: string[]) => authorizeRoles(...roles),
        // 'must-be-active': authorizeByStatus,
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

    /*
    |--------------------------------------------------------------------------
    | Laravel-style Middleware Management
    |--------------------------------------------------------------------------
    */

    /**
     * Get the middleware stack instance for fluent configuration.
     *
     * @example
     * kernel.middlewares()
     *   .alias('auth', authMiddleware)
     *   .group('web', [sessionMiddleware, csrfMiddleware])
     *   .prependToGroup('api', throttleMiddleware);
     */
    middlewares(): MiddlewareStack {
        return middlewareStack;
    }

    /**
     * Register middleware alias.
     *
     * @example
     * kernel.withMiddlewareAlias('auth', authMiddleware);
     * kernel.withMiddlewareAlias('can', (...perms) => authorizePermissions(...perms));
     */
    withMiddlewareAlias(name: string, middleware: MiddlewareEntry | Middleware): this {
        middlewareStack.alias(name, middleware as any);
        registerMiddleware(name, middleware as MiddlewareEntry);
        return this;
    }

    /**
     * Register multiple middleware aliases at once.
     *
     * @example
     * kernel.withMiddlewareAliases({
     *   'auth': authMiddleware,
     *   'can': (...perms) => authorizePermissions(...perms),
     * });
     */
    withMiddlewareAliases(aliases: Record<string, MiddlewareEntry | Middleware>): this {
        for (const [name, middleware] of Object.entries(aliases)) {
            this.withMiddlewareAlias(name, middleware);
        }
        return this;
    }

    /**
     * Define a middleware group.
     *
     * @example
     * kernel.withMiddlewareGroup('web', [sessionMiddleware, csrfMiddleware]);
     */
    withMiddlewareGroup(name: string, middleware: (string | MiddlewareEntry | Middleware)[]): this {
        middlewareStack.group(name, middleware as any);
        this.middlewareGroups[name] = middlewareStack.getResolvedGroup(name);
        return this;
    }

    /**
     * Append middleware to a group.
     *
     * @example
     * kernel.appendToGroup('api', throttleMiddleware);
     */
    appendToGroup(groupName: string, middleware: string | MiddlewareEntry | Middleware): this {
        middlewareStack.appendToGroup(groupName, middleware as any);
        this.middlewareGroups[groupName] = middlewareStack.getResolvedGroup(groupName);
        return this;
    }

    /**
     * Prepend middleware to a group.
     *
     * @example
     * kernel.prependToGroup('api', rateLimitMiddleware);
     */
    prependToGroup(groupName: string, middleware: string | MiddlewareEntry | Middleware): this {
        middlewareStack.prependToGroup(groupName, middleware as any);
        this.middlewareGroups[groupName] = middlewareStack.getResolvedGroup(groupName);
        return this;
    }

    /**
     * Remove middleware from a group.
     *
     * @example
     * kernel.removeFromGroup('web', csrfMiddleware);
     */
    removeFromGroup(groupName: string, middleware: string | MiddlewareEntry | Middleware): this {
        middlewareStack.removeFromGroup(groupName, middleware as any);
        this.middlewareGroups[groupName] = middlewareStack.getResolvedGroup(groupName);
        return this;
    }

    /**
     * Configure the 'web' middleware group.
     *
     * @example
     * kernel.web({
     *   remove: [csrfMiddleware],
     *   append: [customMiddleware],
     * });
     */
    web(config?: { middleware?: (string | MiddlewareEntry | Middleware)[], remove?: (string | MiddlewareEntry | Middleware)[], append?: (string | MiddlewareEntry | Middleware)[], prepend?: (string | MiddlewareEntry | Middleware)[] }): this {
        if (config?.middleware) {
            middlewareStack.group('web', config.middleware as any);
        }
        if (config?.remove) {
            for (const mw of config.remove) {
                middlewareStack.removeFromGroup('web', mw as any);
            }
        }
        if (config?.prepend) {
            for (const mw of config.prepend.reverse()) {
                middlewareStack.prependToGroup('web', mw as any);
            }
        }
        if (config?.append) {
            for (const mw of config.append) {
                middlewareStack.appendToGroup('web', mw as any);
            }
        }
        this.middlewareGroups['web'] = middlewareStack.getResolvedGroup('web');
        return this;
    }

    /**
     * Configure the 'api' middleware group.
     *
     * @example
     * kernel.api({
     *   prepend: [throttleMiddleware],
     * });
     */
    api(config?: { middleware?: (string | MiddlewareEntry | Middleware)[], remove?: (string | MiddlewareEntry | Middleware)[], append?: (string | MiddlewareEntry | Middleware)[], prepend?: (string | MiddlewareEntry | Middleware)[] }): this {
        if (config?.middleware) {
            middlewareStack.group('api', config.middleware as any);
        }
        if (config?.remove) {
            for (const mw of config.remove) {
                middlewareStack.removeFromGroup('api', mw as any);
            }
        }
        if (config?.prepend) {
            for (const mw of config.prepend.reverse()) {
                middlewareStack.prependToGroup('api', mw as any);
            }
        }
        if (config?.append) {
            for (const mw of config.append) {
                middlewareStack.appendToGroup('api', mw as any);
            }
        }
        this.middlewareGroups['api'] = middlewareStack.getResolvedGroup('api');
        return this;
    }

    /**
     * Set middleware priority order.
     *
     * @example
     * kernel.withMiddlewarePriority([
     *   'auth',
     *   'must-be-active',
     *   'can',
     *   'role',
     * ]);
     */
    withMiddlewarePriority(priority: string[]): this {
        this.middlewarePriority = priority;
        middlewareStack.setPriority(priority);
        return this;
    }

    /**
     * Mark middleware as singleton (only instantiated once).
     *
     * @example
     * kernel.singleton(ExpensiveMiddleware);
     */
    singleton(middleware: string | Middleware): this {
        middlewareStack.singleton(middleware as any);
        return this;
    }

    /**
     * Prepend middleware to global stack.
     *
     * @example
     * kernel.prependMiddleware(securityHeaders);
     */
    prependMiddleware(middleware: RequestHandler): this {
        this.middleware.unshift(middleware);
        return this;
    }

    /**
     * Append middleware to global stack.
     *
     * @example
     * kernel.appendMiddleware(loggingMiddleware);
     */
    appendMiddleware(middleware: RequestHandler): this {
        this.middleware.push(middleware);
        return this;
    }

    /**
     * Remove middleware from global stack.
     *
     * @example
     * kernel.removeMiddleware(debugMiddleware);
     */
    removeMiddleware(middleware: RequestHandler): this {
        this.middleware = this.middleware.filter(m => m !== middleware);
        return this;
    }
}
