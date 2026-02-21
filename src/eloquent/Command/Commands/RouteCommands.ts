import { Command } from '@/eloquent/Command/Command';
import { ArgumentsCamelCase } from 'yargs';

export class RouteListCommand extends Command {
    protected signature = 'route:list';
    protected description = 'List all registered routes';

    protected options = {
        method: {
            type: 'string' as const,
            description: 'Filter by HTTP method (GET, POST, PUT, DELETE)',
            alias: 'm',
        },
        path: {
            type: 'string' as const,
            description: 'Filter by path pattern',
            alias: 'p',
        },
        json: {
            type: 'boolean' as const,
            description: 'Output as JSON',
            default: false,
        },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        const methodFilter = args.method ? String(args.method).toUpperCase() : null;
        const pathFilter = args.path ? String(args.path) : null;
        const asJson = args.json as boolean;

        // Lazy import routes AFTER middleware has been registered by artisan.ts
        const { routesBuilder } = require('@/routes/api');
        const { webRoutesBuilder } = require('@/routes/web');

        // Get routes from both API and Web route builders
        const apiRoutes = routesBuilder.getRoutes().map((r: any) => ({
            ...r,
            path: r.path.startsWith('/api') ? r.path : `/api${r.path}`,
        }));
        const webRoutes = webRoutesBuilder.getRoutes();

        let allRoutes = [...apiRoutes, ...webRoutes];

        // Apply filters
        if (methodFilter) {
            allRoutes = allRoutes.filter(r => r.method.toUpperCase() === methodFilter);
        }
        if (pathFilter) {
            allRoutes = allRoutes.filter(r => r.path.includes(pathFilter));
        }

        // Sort by path then method
        allRoutes.sort((a, b) => {
            if (a.path === b.path) {
                return a.method.localeCompare(b.method);
            }
            return a.path.localeCompare(b.path);
        });

        if (asJson) {
            this.line(JSON.stringify(allRoutes, null, 2));
            return;
        }

        if (allRoutes.length === 0) {
            this.warn('No routes found.');
            return;
        }

        // Print header
        this.info('Registered Routes:');
        this.line('');
        this.line(`${'METHOD'.padEnd(10)} ${'PATH'.padEnd(55)} ${'NAME'.padEnd(20)} MIDDLEWARE`);
        this.line('-'.repeat(110));

        // Print routes
        for (const route of allRoutes) {
            const method = this.colorMethod(route.method);
            const middlewareStr = route.middleware?.length ? route.middleware.join(', ') : '-';
            this.line(`${method.padEnd(19)} ${route.path.padEnd(55)} ${(route.name || '-').padEnd(20)} ${middlewareStr}`);
        }

        this.line('');
        this.info(`Total: ${allRoutes.length} route(s)`);
    }

    private colorMethod(method: string): string {
        const colors: Record<string, string> = {
            GET: '\x1b[32m',     // Green
            POST: '\x1b[33m',    // Yellow
            PUT: '\x1b[34m',     // Blue
            PATCH: '\x1b[36m',   // Cyan
            DELETE: '\x1b[31m',  // Red
            OPTIONS: '\x1b[35m', // Magenta
        };
        const reset = '\x1b[0m';
        const color = colors[method.toUpperCase()] || '';
        return `${color}${method}${reset}`;
    }
}
