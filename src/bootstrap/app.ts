/*
|--------------------------------------------------------------------------
| Create The Application
|--------------------------------------------------------------------------
|
| The first thing we will do is create a new application instance
| which serves as the "glue" for all the components, and is
| the IoC container for the system binding all of the various parts.
|
*/

import dotenv from 'dotenv';
import path from 'path';

// Load environment configuration first
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Load global auto-imports (models, cache helpers, auth helpers)
import '@/global/autoload';

import { container } from '@/eloquent/Container/Container';
import { Application } from '@/app/Providers/Application';
import { AppServiceProvider } from '@/app/Providers/AppServiceProvider';
import { RouteServiceProvider } from '@/app/Providers/RouteServiceProvider';
import { DatabaseServiceProvider } from '@/app/Providers/DatabaseServiceProvider';
import { CacheServiceProvider } from '@/app/Providers/CacheServiceProvider';
import { Kernel as HttpKernel } from '@/app/Http/Kernel';
import { getBroadcastManager } from '@/eloquent/Core/Broadcasting';

// Create the application instance
export const app = new Application(container);

/*
|--------------------------------------------------------------------------
| Register Service Providers
|--------------------------------------------------------------------------
|
| Service providers are the central place of all application
| bootstrapping. Your own application, as well as all core
| services are bootstrapped via service providers.
|
*/
export function registerProviders(): void {
    // Application providers
    app.register(AppServiceProvider);
}

/*
|--------------------------------------------------------------------------
| Bootstrap Application
|--------------------------------------------------------------------------
*/
export async function bootstrap(): Promise<void> {
    // Configure base Express middleware (cors, json, urlencoded)
    app.configureBaseMiddleware();

    // Boot all registered providers (async)
    await app.boot();
}

/*
|--------------------------------------------------------------------------
| Create and Boot HTTP Kernel
|--------------------------------------------------------------------------
*/
export function createHttpKernel(): HttpKernel {
    const kernel = new HttpKernel(app);
    kernel.boot();
    return kernel;
}

/*
|--------------------------------------------------------------------------
| Start Application
|--------------------------------------------------------------------------
|
| This function handles the complete application startup sequence:
| 1. Register service providers (including Database and Cache)
| 2. Create and boot HTTP kernel (middleware)
| 3. Bootstrap application (boots providers, mounts routes)
| 4. Configure error handling
| 5. Start the HTTP server
|
*/
export async function startApplication(): Promise<void> {
    const PORT = process.env.PORT || 3000;

    try {
        // Register all service providers
        registerProviders();

        // Create and boot HTTP kernel (registers middleware)
        const kernel = createHttpKernel();

        // Bootstrap application (boots providers including DB/Cache, mounts routes)
        await bootstrap();

        // Auto-sync permissions if enabled
        const syncFlag = String(process.env.SYNC_PERMISSIONS_ON_START || '').toLowerCase();
        if (syncFlag === '1' || syncFlag === 'true') {
            console.log('Permissions auto-sync triggered');
        }

        // Configure error handling (must be after routes)
        kernel.configureErrorHandling();

        // Create HTTP server (needed for WebSocket support)
        const httpServer = app.createHttpServer();

        // Initialize broadcasting/WebSocket if enabled
        const broadcastDriver = process.env.BROADCAST_DRIVER || 'null';
        if (broadcastDriver !== 'null') {
            const broadcastManager = getBroadcastManager();
            broadcastManager.setHttpServer(httpServer);
            await broadcastManager.initialize();

            // Load channel definitions
            await require('@/routes/channels');

            console.log(`📡 Broadcasting enabled with driver: ${broadcastDriver}`);
        }

        // Start the server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            if (broadcastDriver !== 'null') {
                console.log(`🔌 WebSocket available at ws://localhost:${PORT}/ws`);
            }
        });

    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

export default app;
