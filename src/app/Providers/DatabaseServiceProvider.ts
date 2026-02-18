import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { initDatabase, query, getDbType } from '@/config/db.config';
export class DatabaseServiceProvider extends ServiceProvider {
    register(): void {
        this.container.singleton('db', () => ({
            query,
            getDbType,
        }));
        this.container.alias('db', 'database');
    }
    async boot(): Promise<void> {
        await this.initializeDatabase();
    }
    private async initializeDatabase(): Promise<void> {
        const skipDb = String(process.env.SKIP_DB || '').toLowerCase();
        if (skipDb === '1' || skipDb === 'true') {
            console.warn('SKIP_DB is set — skipping database initialization');
            return;
        }
        try {
            await initDatabase();
            console.log('Database connection established');
        } catch (error: any) {
            console.error('Database initialization failed:', error.message);
            throw error;
        }
    }
}
