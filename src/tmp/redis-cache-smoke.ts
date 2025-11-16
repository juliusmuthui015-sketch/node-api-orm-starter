import '@/global/autoload';
import { initCache, cacheSet, cacheGet, cacheClear, cacheKeys } from '@/cache';

async function run() {
  process.env.CACHE_DRIVER = 'redis';
  process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

  try {
    await initCache();
  } catch (e) {
    console.warn('Redis init failed, skipping test:', e);
    return;
  }

  const baseKey = 'redis:test';
  await cacheSet(baseKey, { ok: true }, 5);
  console.log('Value set, fetched:', await cacheGet(baseKey));
  console.log('Keys:', await cacheKeys());
  await cacheClear();
  console.log('Keys after clear:', await cacheKeys());
}

run().catch(e => { console.error(e); process.exit(1); });
