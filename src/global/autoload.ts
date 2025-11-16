// Global autoload: attaches commonly used helpers, models, and cache utilities to globalThis
// This lets you use User, Role, Permission, cacheGet, auth(), etc. without importing.
// Keep this lightweight; only include stable, frequently used APIs.

import * as Models from '@/server/Models/User';
import * as CacheFns from '@/cache';
import * as AuthHelpers from '@/server/helpers/auth';

function defineGlobal(name: string, value: any) {
  if ((globalThis as any)[name] !== undefined) return; // avoid overwriting if already defined
  Object.defineProperty(globalThis, name, {
    value,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

// Models (User, Role, Permission, UserProfile)
for (const key of ['User', 'Role', 'Permission', 'UserProfile']) {
  if ((Models as any)[key]) defineGlobal(key, (Models as any)[key]);
}

// Cache convenience functions + default manager instance
for (const key of ['cacheGet', 'cacheSet', 'cacheDel', 'cacheHas', 'cacheClear', 'initCache', 'cacheKeys', 'generateCacheKey']) {
  if ((CacheFns as any)[key]) defineGlobal(key, (CacheFns as any)[key]);
}
// default cache manager (access as CacheManager or cacheManager)
if ((CacheFns as any).default) {
  defineGlobal('cache', (CacheFns as any).default);
  defineGlobal('cacheManager', (CacheFns as any).default); // legacy alias
}

// Auth helpers
for (const key of ['auth', 'authenticate', 'setUser', 'clearUser', 'parseRequest']) {
  if ((AuthHelpers as any)[key]) defineGlobal(key, (AuthHelpers as any)[key]);
}

// Optionally expose a registry for introspection
defineGlobal('autoImported', Object.freeze({
  models: ['User', 'Role', 'Permission', 'UserProfile'],
  cache: ['cache', 'cacheManager', 'cacheGet', 'cacheSet', 'cacheDel', 'cacheHas', 'cacheClear', 'initCache', 'cacheKeys', 'generateCacheKey'],
  auth: ['auth', 'authenticate', 'setUser', 'clearUser', 'parseRequest']
}));

// No exports needed; side effects only.
