# Service Providers

Service providers are the central place for bootstrapping your application.

## Overview

Service providers follow the Laravel-style pattern with `register()` and `boot()` methods.

## AppServiceProvider

```typescript
import { ServiceProvider, ServiceProviderClass } from '@/eloquent/Providers/ServiceProvider';
import { DatabaseServiceProvider } from '@/app/Providers/DatabaseServiceProvider';
import { CacheServiceProvider } from '@/app/Providers/CacheServiceProvider';
import { RouteServiceProvider } from '@/app';

export class AppServiceProvider extends ServiceProvider {
    protected additionalProviders: ServiceProviderClass[] = [
        DatabaseServiceProvider,
        CacheServiceProvider,
        RouteServiceProvider,
    ];

    register(): void {
        this.registerProviders(this.additionalProviders);
        // Register singleton services
        // this.container.singleton(MyService);
    }

    boot(): void {
        this.registerObservers();
        this.registerLifecycleCallbacks();
    }

    protected registerObservers(): void {
        // Register model observers
    }

    protected registerLifecycleCallbacks(): void {
        this.booted(() => {
            // Runs after all providers have booted
        });
    }
}
```

## Creating a Service Provider

```typescript
import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';

export class MyServiceProvider extends ServiceProvider {
    register(): void {
        this.container.singleton(MyService);
        this.container.alias(MyService, 'my-service');
    }

    boot(): void {
        const myService = this.container.resolve(MyService);
        myService.initialize();
    }
}
```

## Container Methods

```typescript
// Singleton - same instance every time
this.container.singleton(MyService);

// Bind - new instance every time
this.container.bind('key', () => new MyService());

// Alias
this.container.alias(MyService, 'my-service');

// Resolve
const service = this.container.resolve(MyService);
```

