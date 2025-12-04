#!/usr/bin/env ts-node
import 'dotenv/config';
import apiRouter, { routesBuilder } from '@/server/routes';

// Simple CLI to list registered Express routes from the consolidated router
// Usage: ts-node src/tools/route-list.ts

function pathFromRegexp(regexp: RegExp | undefined): string {
    if (!regexp) return '';
    let s = regexp.toString();
    // common patterns produced by express for mounted routers. Try to clean-up
    // Example: /^\/api\/?(?=\/|$)/i  -> /api
    s = s.replace('/^', '').replace('/i', '');
    s = s.replace(/\\\//g, '/');
    s = s.replace(/\/?\(\?=\\\/\|\$\)/g, '');
    s = s.replace(/\$$/, '');
    s = s.replace(/^\^/, '');
    // remove any remaining escaped chars
    s = s.replace(/\\/g, '');
    return s;
}

function listRouter(router: any, prefix = ''): { method: string; path: string }[] {
    const out: { method: string; path: string }[] = [];
    const stack = router && router.stack ? router.stack : [];

    for (const layer of stack) {
        // Routes added directly (layer.route is set)
        if (layer.route) {
            const routePath = layer.route.path || '';
            const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
            for (const m of methods) {
                out.push({ method: m, path: prefix + routePath });
            }
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            // Mounted router - derive the mount path and recurse
            const mount = pathFromRegexp(layer.regexp);
            out.push(...listRouter(layer.handle, prefix + mount));
        } else if (layer.handle && layer.handle.stack) {
            // Some express versions use 'layer.handle' as a router
            const mount = pathFromRegexp(layer.regexp);
            out.push(...listRouter(layer.handle, prefix + mount));
        }
    }
    return out;
}

function printRoutes() {
    const routes = listRouter(apiRouter);
    const named = routesBuilder?.getRoutes ? routesBuilder.getRoutes() : [];
    if (!routes.length && !named.length) {
        console.log('(no routes)');
        return;
    }
    // sort by path then method
    routes.sort((a, b) =>
        a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
    );
    for (const r of routes) {
        console.log(`${r.method}\t${r.path}`);
    }
    if (named.length) {
        console.log('\nNamed routes:');
        const sortedNamed = [...named].sort((a, b) =>
            a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
        );
        for (const r of sortedNamed) {
            console.log(`${r.method}\t${r.path}\t${r.name}`);
        }
        console.log(`Total named: ${named.length}`);
    }
    console.log(`Total: ${routes.length}`);
}

try {
    printRoutes();
} catch (e) {
    console.error('Failed to list routes:', e);
    process.exit(1);
}
