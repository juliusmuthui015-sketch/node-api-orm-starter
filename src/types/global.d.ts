// Global declaration of auto-imported symbols provided by src/global/autoload.ts
// Use helpers/models without manual imports.

import type { User as UserClass } from '@/server/Models/User/User';
import type { Role as RoleClass } from '@/server/Models/User/Role';
import type { Permission as PermissionClass } from '@/server/Models/User/Permission';
import type { UserProfile as UserProfileClass } from '@/server/Models/User/UserProfile';

import type { auth as authFn, authenticate as authenticateFn, setUser as setUserFn, clearUser as clearUserFn, parseRequest as parseRequestFn } from '@/server/helpers/auth';

import type { initCache as initCacheFn, cacheGet as cacheGetFn, cacheSet as cacheSetFn, cacheDel as cacheDelFn, cacheHas as cacheHasFn, cacheClear as cacheClearFn, cacheKeys as cacheKeysFn, generateCacheKey as generateCacheKeyFn } from '@/cache';
import type cacheManagerInstance from '@/cache';

declare global {
  const User: typeof UserClass;
  const Role: typeof RoleClass;
  const Permission: typeof PermissionClass;
  const UserProfile: typeof UserProfileClass;

  const auth: typeof authFn;
  const authenticate: typeof authenticateFn;
  const setUser: typeof setUserFn;
  const clearUser: typeof clearUserFn;
  const parseRequest: typeof parseRequestFn;

  const initCache: typeof initCacheFn;
  const cacheGet: typeof cacheGetFn;
  const cacheSet: typeof cacheSetFn;
  const cacheDel: typeof cacheDelFn;
  const cacheHas: typeof cacheHasFn;
  const cacheClear: typeof cacheClearFn;
  const cacheKeys: typeof cacheKeysFn;
  const generateCacheKey: typeof generateCacheKeyFn;
  const cache: typeof cacheManagerInstance; // alias for cache manager instance
  const cacheManager: typeof cacheManagerInstance; // existing name retained

  const autoImported: Readonly<{
    models: readonly string[];
    cache: readonly string[];
    auth: readonly string[];
  }>;
}

export {};
