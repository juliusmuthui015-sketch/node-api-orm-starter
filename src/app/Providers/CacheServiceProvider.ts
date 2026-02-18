import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import {
    initCache,
    Cache,
    generateCacheKey,
    getCacheDriver,
    getCacheDriverName,
} from '@/cache';
export class CacheServiceProvider extends ServiceProvider {
    register(): void {
        this.container.singleton('cache', () => Cache);
        this.container.singleton('cache.key', () => generateCacheKey);
        this.container.singleton('cache.driver', () => getCacheDriver);
        this.container.singleton('cache.driverName', () => getCacheDriverName);
    }
    async boot(): Promise<void> {
        await this.initializeCache();
    }
    private async initializeCache(): Promise<void> {
        const skipCache = String(process.env.SKIP_CACHE || '').toLowerCase();
        if (skipCache === '1' || skipCache === 'true') {
            console.warn('SKIP_CACHE is set — skipping cache initialization');
            return;
        }
        try {
            await initCache();
            const driverName = getCacheDriverName();
            console.log(`Cache initialized (driver=${driverName})`);
        } catch (error: any) {
            console.error('Cache initialization failed:', error.message);
        }
    }
}
