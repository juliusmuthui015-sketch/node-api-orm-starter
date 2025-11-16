import '@/global/autoload';
import { initDatabase } from '@/config/db.config';
import { initCache, cacheSet, cacheGet, cacheDel, cacheHas } from '@/cache';

async function run() {
  process.env.CACHE_DRIVER = 'database';
  await initDatabase();
  await initCache();
  const key = 'dbcache:test';
  await cacheSet(key, { value: 123 }, 2);
  console.log('Has after set:', await cacheHas(key));
  console.log('Get after set:', await cacheGet(key));
  await new Promise(r => setTimeout(r, 2500)); // wait for expiry
  console.log('Get after expiry (should be null):', await cacheGet(key));
  await cacheSet(key, 'raw-string', 10);
  console.log('Get raw string:', await cacheGet(key));
  await cacheDel(key);
  console.log('Has after delete (should be false):', await cacheHas(key));
}

run().catch(e => { console.error(e); process.exit(1); });

