import { Application } from "@/app/Providers/Application";
import {
  registerMiddleware,
  middlewareStack,
  MiddlewareEntry,
  Middleware,
} from "@/eloquent/Middleware/middleware";
import { Abstract } from "@/eloquent/Container/Container";

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

  singleton<T>(abstract: Abstract<T>, concrete: any = abstract) {
    this.container.singleton(abstract, concrete);
  }

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
    | Middleware Registration (Laravel-style)
    |--------------------------------------------------------------------------
    */

  /**
   * Register a middleware alias.
   *
   * @example
   * this.middlewareAlias('auth', authMiddleware);
   * this.middlewareAlias('can', (...perms) => authorizePermissions(...perms));
   */
  protected middlewareAlias(name: string, middleware: MiddlewareEntry | Middleware): this {
    middlewareStack.alias(name, middleware as any);
    registerMiddleware(name, middleware as MiddlewareEntry);
    return this;
  }

  /**
   * Register multiple middleware aliases at once.
   *
   * @example
   * this.middlewareAliases({
   *   'auth': authMiddleware,
   *   'can': (...perms) => authorizePermissions(...perms),
   *   'role': (...roles) => authorizeRoles(...roles),
   * });
   */
  protected middlewareAliases(aliases: Record<string, MiddlewareEntry | Middleware>): this {
    for (const [name, middleware] of Object.entries(aliases)) {
      this.middlewareAlias(name, middleware);
    }
    return this;
  }

  /**
   * Define a middleware group.
   *
   * @example
   * this.middlewareGroup('api', [throttleMiddleware, 'auth']);
   */
  protected middlewareGroup(
    name: string,
    middleware: (string | MiddlewareEntry | Middleware)[],
  ): this {
    middlewareStack.group(name, middleware as any);
    return this;
  }

  /**
   * Append middleware to a group.
   *
   * @example
   * this.appendMiddlewareToGroup('api', rateLimitMiddleware);
   */
  protected appendMiddlewareToGroup(
    groupName: string,
    middleware: string | MiddlewareEntry | Middleware,
  ): this {
    middlewareStack.appendToGroup(groupName, middleware as any);
    return this;
  }

  /**
   * Prepend middleware to a group.
   *
   * @example
   * this.prependMiddlewareToGroup('api', securityMiddleware);
   */
  protected prependMiddlewareToGroup(
    groupName: string,
    middleware: string | MiddlewareEntry | Middleware,
  ): this {
    middlewareStack.prependToGroup(groupName, middleware as any);
    return this;
  }

  /**
   * Remove middleware from a group.
   *
   * @example
   * this.removeMiddlewareFromGroup('web', csrfMiddleware);
   */
  protected removeMiddlewareFromGroup(
    groupName: string,
    middleware: string | MiddlewareEntry | Middleware,
  ): this {
    middlewareStack.removeFromGroup(groupName, middleware as any);
    return this;
  }

  /**
   * Set middleware priority order.
   *
   * @example
   * this.middlewarePriority(['auth', 'can', 'role']);
   */
  protected middlewarePriority(priority: string[]): this {
    middlewareStack.setPriority(priority);
    return this;
  }

  /**
   * Mark middleware as singleton (only instantiated once).
   *
   * @example
   * this.singletonMiddleware(ExpensiveMiddleware);
   */
  protected singletonMiddleware(middleware: string | Middleware): this {
    middlewareStack.singleton(middleware as any);
    return this;
  }

  /**
   * Get the middleware stack for advanced configuration.
   *
   * @example
   * this.middleware()
   *   .alias('custom', customMiddleware)
   *   .group('admin', ['auth', 'role:admin']);
   */
  protected middleware(): typeof middlewareStack {
    return middlewareStack;
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
