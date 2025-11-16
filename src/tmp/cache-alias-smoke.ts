import '@/global/autoload';
import { initCache } from '@/cache';

async function run() {
  // Use global cache alias
  await initCache(); // ensure underlying driver ready
  // Using cache.init() as alternative
  if (typeof cache.init === 'function') {
    await cache.init();
  }
  await cache.set('alias:test', { ok: true }, 1);
  const v = await cache.get('alias:test');
  console.log('cache.get value:', v);
  console.log('cache.has:', await cache.has('alias:test'));
  console.log('cache.keys (may not include expired yet):', await cache.keys());
  await new Promise(r => setTimeout(r, 1100));
  console.log('cache.get after TTL:', await cache.get('alias:test'));
  console.log('cache.has after TTL:', await cache.has('alias:test'));
}

run().catch(e => { console.error('cache alias smoke failed', e); process.exit(1); });
