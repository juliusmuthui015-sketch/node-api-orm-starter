// Smoke test for auto-imported globals (run with ts-node-dev or after build with node build/tmp/auto-import-smoke.js)

import '@/global/autoload';

async function run() {
  console.log('Auto imported registry:', autoImported);

  // Use a model without importing
  const builder = User.where('email', '=', 'nonexistent@example.com');
  console.log('User query builder created ok?', !!builder);

  // Cache helpers
  await initCache();
  await cacheSet('smoke:key', { ok: true }, 5);
  const val = await cacheGet('smoke:key');
  console.log('Cached value:', val);

  // Auth helper (will be unauthenticated in this isolated run)
  console.log('Auth check (expected false):', auth().check());
}

run().catch(e => {
  console.error('Smoke test failed', e);
  process.exit(1);
});
