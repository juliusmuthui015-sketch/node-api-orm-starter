import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Resolve .env relative to this compiled file's directory so it works both in TS and built JS
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Load global auto-imports (models, cache helpers, auth helpers)
import '@/global/autoload';

// Import database after loading env so top-level DB config reads the populated process.env
import { initDatabase, query as _dbQuery } from '@/config/db.config';
import '@/server/Providers/providers';
import apiRouter from '@/server/routes';
import { asyncContextMiddleware } from './middleware/asyncContext';
import requestLoggerMiddleware from './middleware/requestLogger';
import validatorMiddleware from './middleware/validatorMiddleware';
import { initCache } from '@/cache';
import errorHandler from './middleware/errorHandler';
import responseExtenderMiddleware from "@/server/middleware/responseExtenderMiddleware";
import modelRegisterMiddleware from '@/server/middleware/modelRegister';

const app: Application = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Note: request logger is mounted inside bootstrap after asyncContextMiddleware

async function autoSyncPermissionsIfEnabled() {
    const flag = String(process.env.SYNC_PERMISSIONS_ON_START || '').toLowerCase();
    if (flag === '1' || flag === 'true') {
        try {
            // const syncModule = await import('../../db/seeders/sync-permissions.js');
            // Module runs immediately; just log info
            console.log('Permissions auto-sync triggered');
        } catch (e) {
            console.error('Auto permission sync failed:', e);
        }
    }
}

async function bootstrap() {
    try {
        // allow skipping DB init for local dev/testing with SKIP_DB=1 or SKIP_DB=true
        const skipDb = String(process.env.SKIP_DB || '').toLowerCase();
        if (skipDb === '1' || skipDb === 'true') {
            console.warn('SKIP_DB is set — skipping database initialization');
        } else {
            await initDatabase();
            console.log('Database connection established');
            await autoSyncPermissionsIfEnabled();
        }

        // initialize cache (driver selected via CACHE_DRIVER in .env). Set SKIP_CACHE=1 to skip.
        const skipCache = String(process.env.SKIP_CACHE || '').toLowerCase();
        if (skipCache === '1' || skipCache === 'true') {
            console.warn('SKIP_CACHE is set — skipping cache initialization');
        } else {
            try {
                await initCache();
                console.log(`Cache initialized (driver=${process.env.CACHE_DRIVER || 'file'})`);
            } catch (e) {
                console.error('Cache initialization failed:', e);
            }
        }

        // mount middleware
        app.use(asyncContextMiddleware);
        // Log incoming requests to the terminal (method, url, status, duration, ip, user)
        app.use(requestLoggerMiddleware);
        // Attach request.validate helper
        app.use(validatorMiddleware);

        app.use(responseExtenderMiddleware)

        // auto-register models into cache and global registry
        app.use(modelRegisterMiddleware);

        // mount consolidated Laravel-style routes
        app.use(apiRouter);

        // Optional migration lock monitoring endpoint (register before 404 handler)
        const enableLockEndpoint = String(
            process.env.ENABLE_MIGRATION_LOCK_ENDPOINT || '',
        ).toLowerCase();
        if (enableLockEndpoint === '1' || enableLockEndpoint === 'true') {
            app.get('/internal/migrations/lock', async (req, res) => {
                try {
                    const lockName =
                        (req.query.name as string) ||
                        process.env.MIGRATION_LOCK_NAME ||
                        'rentivo_migrations_lock';
                    const rows: any = await _dbQuery(
                        'SELECT IS_FREE_LOCK(?) as is_free, IS_USED_LOCK(?) as holder',
                        [lockName, lockName],
                    );
                    const r = rows && rows[0] ? rows[0] : null;
                    return res.json({
                        lockName,
                        isFree: r ? r.is_free === 1 : null,
                        holder: r ? r.holder : null,
                    });
                } catch (e) {
                    return res.status(500).json({ error: String(e) });
                }
            });
            console.log('Migration lock monitoring endpoint enabled at GET /internal/migrations/lock');
        }

        // 404 handler (JSON)
        app.use((req, res) => {
            res.status(404).json({ success: false, message: 'Not Found' });
        });

        // Global error handler (must be after all other middleware & routes)
        app.use(errorHandler);

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to initialize database connection', err);
        process.exit(1);
    }
}

bootstrap();

export default app;
