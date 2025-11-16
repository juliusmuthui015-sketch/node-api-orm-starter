#!/usr/bin/env ts-node
// Cache Management CLI
// Commands: list, get <key>, has <key>, set <key> <value> [--ttl seconds], del <key>, clear, gen <parts...>, driver
// Value auto-parsed if JSON-like.

import 'dotenv/config';
import '@/global/autoload';
import { initCache, cacheGet, cacheSet, cacheDel, cacheHas, cacheClear, cacheKeys, generateCacheKey } from '@/cache';
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

async function bootstrap() {
  await initCache();
}

function parseMaybeJson(input: string): any {
  if (!input) return input;
  const first = input.trim()[0];
  if (first === '{' || first === '[') {
    try { return JSON.parse(input); } catch { return input; }
  }
  return input;
}

async function main() {
  await bootstrap();

  yargs(hideBin(process.argv))
    .scriptName('cache')
    .usage('$0 <command> [options]')
    .command('list', 'List all cache keys', (y: Argv) => y, async () => {
      const keys = await cacheKeys();
      if (!keys.length) {
        console.log('(no keys)');
      } else {
        keys.forEach(k => console.log(k));
        console.log(`Total: ${keys.length}`);
      }
    })
    .command('get <key>', 'Get cached value', (y: Argv) => y.positional('key', { type: 'string' }), async (argv: any) => {
      const val = await cacheGet(String(argv.key));
      if (val === null) {
        console.log('(null)');
      } else {
        console.log(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
      }
    })
    .command('has <key>', 'Check if key exists', (y: Argv) => y.positional('key', { type: 'string' }), async (argv: any) => {
      const ok = await cacheHas(String(argv.key));
      console.log(ok ? 'true' : 'false');
    })
    .command('set <key> <value>', 'Set cached value', (y: Argv) => y
      .positional('key', { type: 'string' })
      .positional('value', { type: 'string' })
      .option('ttl', { type: 'number', describe: 'TTL seconds', default: 0 })
    , async (argv: any) => {
      const key = String(argv.key);
      const raw = String(argv.value);
      const value = parseMaybeJson(raw);
      await cacheSet(key, value, argv.ttl && argv.ttl > 0 ? argv.ttl : undefined);
      console.log('OK');
    })
    .command('del <key>', 'Delete a key', (y: Argv) => y.positional('key', { type: 'string' }), async (argv: any) => {
      const deleted = await cacheDel(String(argv.key));
      console.log(deleted ? 'deleted' : 'not found');
    })
    .command('clear', 'Clear all cache entries', (y: Argv) => y, async () => {
      await cacheClear();
      console.log('cleared');
    })
    .command('gen <parts...>', 'Generate a cache key from parts (unprefixed)', (y: Argv) => y.positional('parts', { array: true }), async (argv: any) => {
      const key = generateCacheKey(...(argv.parts as any[]));
      console.log(key);
    })
    .command('driver', 'Show cache driver info', (y: Argv) => y, async () => {
      const driver = (process.env.CACHE_DRIVER || 'file').toLowerCase();
      const prefix = process.env.CACHE_PREFIX || '(none)';
      console.log(JSON.stringify({ driver, prefix }, null, 2));
    })
    .demandCommand(1, 'Specify a command. Use --help for usage.')
    .strict()
    .help()
    .parse();
}

main().catch(err => {
  console.error('Cache CLI error:', err);
  process.exit(1);
});
