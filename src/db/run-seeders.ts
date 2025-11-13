import fs from 'fs';
import path from 'path';
import { initDatabase, query } from '@/config/db.config';

function parseArgs(argv: string[]) {
  const out: any = { runAll: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--class=')) out.class = a.split('=')[1];
    else if (a === '--class') out.class = argv[i+1];
  }
  return out;
}

async function loadAndRunSeeder(filePath: string) {
  const mod = require(filePath);
  // try several common export patterns
  const fn = mod && (mod.seed || mod.default || mod.run || mod);
  if (typeof fn === 'function') {
    // seeders may accept (query) or no args
    const res = fn.length >= 1 ? fn(query) : fn();
    if (res && typeof res.then === 'function') await res;
    return true;
  }
  return false;
}

async function run() {
  await runWithOptions({});
}

async function runWithOptions(opts: { class?: string } = {}) {
  await initDatabase();
  const args = parseArgs(process.argv);
  // merge options: explicit opts.class overrides CLI --class
  const seederClass = opts.class || (args.class as string | undefined) || undefined;
  const dir = path.resolve(__dirname, './seeders');
  if (!fs.existsSync(dir)) {
    console.warn('No seeders directory found:', dir);
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') || f.endsWith('.js')).sort();
  // if class specified, try to find matching file by base name
  if (seederClass) {
    const targetBase = seederClass.replace(/Seeder$/i, '');
    const match = files.find(f => f.replace(/\.(ts|js)$/i,'').toLowerCase() === seederClass.toLowerCase() || f.replace(/\.(ts|js)$/i,'').toLowerCase() === (targetBase.toLowerCase() + 'seeder'));
    if (!match) throw new Error(`Seeder class ${seederClass} not found in ${dir}`);
    const full = path.join(dir, match);
    if (full.endsWith('.ts')) require('ts-node/register/transpile-only');
    const ok = await loadAndRunSeeder(full);
    if (!ok) console.warn('Seeder did not export a callable function:', full);
    return;
  }

  // Prefer DatabaseSeeder if present
  const dbSeederFile = files.find(f => f.replace(/\.(ts|js)$/i,'').toLowerCase() === 'databaseseeder');
  if (dbSeederFile) {
    const full = path.join(dir, dbSeederFile);
    if (full.endsWith('.ts')) require('ts-node/register/transpile-only');
    await loadAndRunSeeder(full);
    return;
  }

  // Otherwise run all seeders in order
  for (const f of files) {
    const full = path.join(dir, f);
    if (full.endsWith('.ts')) require('ts-node/register/transpile-only');
    console.log('Running seeder', f);
    try {
      const ok = await loadAndRunSeeder(full);
      if (!ok) console.warn('Seeder did not export a callable function:', f);
    } catch (e) {
      console.error('Seeder failed', f, e);
      throw e;
    }
  }
}

// expose run() and runWithOptions() for programmatic use and only execute when invoked directly
module.exports.run = run;
module.exports.runWithOptions = runWithOptions;

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}
