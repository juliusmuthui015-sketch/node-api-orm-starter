import {RequestHandler} from "express";

type MiddlewareEntry = RequestHandler | ((...args: any[]) => RequestHandler);

const registry: Record<string, MiddlewareEntry> = {};

export function registerMiddleware(name: string, entry: MiddlewareEntry) {
    registry[name] = entry;
}

export function resolveMiddleware(mw: string | RequestHandler | (RequestHandler | string)[]): RequestHandler | RequestHandler[] {
    if (typeof mw === 'function') return mw;
    if (Array.isArray(mw)) return mw.map(m => resolveMiddleware(m) as RequestHandler);

    // string -> maybe 'auth' or 'can:view_users' or 'role:admin'
    const [key, rest] = (mw as string).split(':');
    if (rest !== undefined && rest.split(',').length > 0) {
        const args = rest ? rest.split(',').map(s => s.trim()) : [];
        const factory = registry[key] as any;
        if (!factory) {
            // Attempt to lazily load default providers (may not have been imported yet)
            try {
                // use require for synchronous load
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                require('@/server/Providers/providers');
            } catch (e) {
                // ignore
            }
            const retryFactory = registry[key] as any;
            if (!retryFactory) throw new Error(`Unknown middleware factory: ${key}`);
            return retryFactory(...args);
        }
        return factory(...args);
    }

    const found = registry[mw as string];
    if (found) return (found as RequestHandler);

    // Try to require providers to register defaults and retry
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('@/server/Providers/providers');
    } catch (e) {
        // ignore
    }
    const found2 = registry[mw as string];
    if (found2) return (found2 as RequestHandler);

    throw new Error(`Unknown middleware: ${String(mw)}`);
}