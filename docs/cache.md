# Cache

Unified cache API with drivers: file (default), database, redis. Optional encryption using APP_KEY.

Env
- CACHE_DRIVER=file | database | redis
- CACHE_PREFIX=app
- APP_KEY=base64:... (or 32-byte key)
- REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD

API
```ts
import cache, { cacheGet, cacheSet, cacheDel, cacheHas, cacheClear, cacheKeys, generateCacheKey } from '@/cache';

await cacheSet('users:count', 42, 300);
const n = await cacheGet('users:count');
const has = await cacheHas('users:count');
await cacheDel('users:count');
const keys = await cacheKeys();

const key = generateCacheKey('users','page',1,'q','john');
```

Encryption
- If APP_KEY is set, values are encrypted with AES-256-CBC and a MAC (HMAC-SHA256)
- APP_KEY can be `base64:...` or any string; we derive a 32-byte key via SHA-256 when needed

Drivers
- file: stores JSON payloads in tmp/cache under the build dir
- database: uses Cache model/table (migrations included)
- redis: requires `redis` package; uses SCAN for keys(), flushDb() for clear()

Notes
- TTL is per-set call (seconds). `null/undefined` ttl means no expiry.
- Keys are automatically prefixed with CACHE_PREFIX; cacheKeys() returns unprefixed names.

