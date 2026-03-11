import fs from 'fs';
import path from 'path';
import {
  initDatabase,
  query,
  getDbType,
  getMongoDb,
  collection as mongoCollection,
} from '@/config/db.config';

export interface SeederOptions {
  class?: string;
  force?: boolean;
}

function parseArgs(argv: string[]): SeederOptions {
  const out: SeederOptions = { class: undefined, force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--class=')) out.class = a.split('=')[1];
    else if (a === '--class' && argv[i + 1]) {
      out.class = argv[i + 1];
      i++; // skip next arg
    }
    else if (a === '--force' || a === '-f') out.force = true;
  }
  return out;
}

// Provide a DB-aware context to seeders that accept an argument
type SqlSeederCtx = { type: 'mysql'; query: typeof query };
// Use loose any to avoid importing mongodb types here
type MongoSeederCtx = { type: 'mongodb'; db: any; collection: (name: string) => any };

type SeederCtx = SqlSeederCtx | MongoSeederCtx;

function makeSeederContext(): SeederCtx {
  const t = getDbType();
  if (t === 'mongodb') {
    const db = getMongoDb();
    return { type: 'mongodb', db, collection: (name: string) => mongoCollection(name) };
  }
  return { type: 'mysql', query };
}

async function loadAndRunSeeder(filePath: string) {
  const mod = require(filePath);
  // try several common export patterns
  const fn = mod && (mod.seed || mod.default || mod.run || mod);
  if (typeof fn === 'function') {
    // If seeder expects an argument, pass either query (MySQL) or Mongo context (MongoDB)
    const wantsArg = fn.length >= 1;
    let arg: any = undefined;
    if (wantsArg) {
      const t = getDbType();
      if (t === 'mysql') arg = query;
      else arg = makeSeederContext();
    }
    const res = wantsArg ? fn(arg) : fn();
    if (res && typeof res.then === 'function') await res;
    return true;
  }
  return false;
}

async function run(inputOptions?: SeederOptions) {
  await initDatabase();

  // Merge input options with parsed args from process.argv
  const parsedArgs = parseArgs(process.argv);
  const opts: SeederOptions = inputOptions ? { ...parsedArgs, ...inputOptions } : parsedArgs;

  const seederClass = opts.class;
  const dir = path.resolve(process.cwd(), 'src/database/seeders');

  if (!fs.existsSync(dir)) {
    console.warn('No seeders directory found:', dir);
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .sort();

  // if class specified, try to find matching file by base name
  if (seederClass) {
    const targetBase = seederClass.replace(/Seeder$/i, '');
    const match = files.find(
      (f) =>
        f.replace(/\.(ts|js)$/i, '').toLowerCase() === seederClass.toLowerCase() ||
        f.replace(/\.(ts|js)$/i, '').toLowerCase() === targetBase.toLowerCase() + 'seeder',
    );
    if (!match) throw new Error(`Seeder class ${seederClass} not found in ${dir}`);
    const full = path.join(dir, match);
    if (full.endsWith('.ts')) require('ts-node/register/transpile-only');
    console.log(`Running seeder: ${match}`);
    const ok = await loadAndRunSeeder(full);
    if (!ok) console.warn('Seeder did not export a callable function:', full);
    return;
  }

  // Prefer DatabaseSeeder if present
  const dbSeederFile = files.find(
    (f) => f.replace(/\.(ts|js)$/i, '').toLowerCase() === 'databaseseeder',
  );
  if (dbSeederFile) {
    const full = path.join(dir, dbSeederFile);
    if (full.endsWith('.ts')) require('ts-node/register/transpile-only');
    console.log('Running DatabaseSeeder...');
    await loadAndRunSeeder(full);
    return;
  }

  // Otherwise run all seeders in order
  console.log(`Running all ${files.length} seeders...`);
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

  console.log('All seeders completed successfully.');
}

// expose run() for programmatic use and only execute when invoked directly
module.exports.run = run;
export { run };

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
