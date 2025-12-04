import fs from 'fs';
import path from 'path';
import { cacheSet, generateCacheKey } from '@/cache';
import RouterBuilder from '@/eloquent/Router/router';
import { Model } from '@/eloquent/Model';

// Scan src/server/Models tree, import classes extending Model, register them, and cache the registry summary
export async function registerModelsIntoCache() {
  const modelsRoot = path.resolve(__dirname, '../../server/Models');
  const found: Array<{ name: string; file: string }> = [];

  async function walk(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && /\.(ts|js)$/.test(ent.name)) {
        // Import module and inspect exports
        try {
          // Resolve TS path alias via compiled outputs when running from build; prefer require for CJS
          const mod = require(full);
          for (const [key, val] of Object.entries(mod)) {
            if (typeof val === 'function' && val.prototype && (val.prototype instanceof Model)) {
              const className = key;
              RouterBuilder.registerModel(className, val as unknown as typeof Model);
              found.push({ name: className, file: full });
            }
          }
          // Default export case
          if (typeof mod.default === 'function' && mod.default.prototype && (mod.default.prototype instanceof Model)) {
            const className = mod.default.name || path.parse(ent.name).name;
            RouterBuilder.registerModel(className, mod.default as unknown as typeof Model);
            found.push({ name: className, file: full });
          }
        } catch (e) {
          // non-fatal; continue scanning
          // console.warn('Model scan import error for', full, e);
        }
      }
    }
  }

  try {
    await walk(modelsRoot);
  } catch (e) {
    // ignore if path missing in certain deployments
  }

  // Cache the registry summary for quick introspection/debugging
  const cacheKey = generateCacheKey('models', 'registry');
  await cacheSet(cacheKey, { count: found.length, items: found });
}

export default async function modelRegisterMiddleware(req: any, _res: any, next: any) {
  try {
    // Only run once per process; guard via flag
    if (!(globalThis as any).__modelsRegistered) {
      await registerModelsIntoCache();
      (globalThis as any).__modelsRegistered = true;
    }
  } catch (e) {
    // proceed even if scan fails
  }
  next();
}
