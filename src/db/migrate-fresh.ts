import readline from 'readline';
import { initDatabase, query, getDbType, getMongoDb } from '../config/db.config';
import path from 'path';

function parseArgs(argv: string[]) {
  const out: any = { force: false, seed: false, seederClass: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--seed') out.seed = true;
    else if (a.startsWith('--seeder=')) out.seederClass = a.split('=')[1];
  }
  return out;
}

async function promptConfirm(question: string) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans: string = await new Promise(res => rl.question(question + ' ', a => { rl.close(); res(a); }));
  return /^y(es)?$/i.test(ans.trim());
}

async function run() {
  await initDatabase();
  const args = parseArgs(process.argv);

  if (getDbType() === 'mongodb') {
    const db = getMongoDb();
    const dbName = db.databaseName;

    if (!args.force) {
      const ok = await promptConfirm(`This will DROP ALL COLLECTIONS in database '${dbName}'. Are you sure? (y/N)`);
      if (!ok) {
        console.log('Aborted.');
        process.exit(0);
      }
    } else {
      console.log('Force flag provided; proceeding without confirmation');
    }

    // Drop all collections
    const collections = await db.collections();
    for (const c of collections) {
      try { await c.drop(); } catch (e) { /* ignore */ }
    }

    // Run migrations
    console.log('Running migrations...');
    const mmod = require('./run-migrations');
    if (mmod && typeof mmod.run === 'function') {
      await mmod.run();
    } else {
      throw new Error('run-migrations module does not export run()');
    }

    // optionally run seeders
    if (args.seed) {
      console.log('Running seeders...');
      const smod = require('./run-seeders');
      if (smod && typeof smod.runWithOptions === 'function') {
        await smod.runWithOptions({ class: args.seederClass });
      } else if (smod && typeof smod.run === 'function') {
        await smod.run();
      } else {
        console.warn('Seeder runner not available');
      }
    }

    console.log('migrate:fresh complete');
    return;
  }

  // MySQL path
  const dbNameRows: any = await query('SELECT DATABASE() as db');
  const dbName = dbNameRows && dbNameRows[0] && dbNameRows[0].db;

  if (!args.force) {
    const ok = await promptConfirm(`This will DROP ALL TABLES in database '${dbName}'. Are you sure? (y/N)`);
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  } else {
    console.log('Force flag provided; proceeding without confirmation');
  }

  // acquire a lock to prevent concurrent operations
  const lockName = process.env.MIGRATION_LOCK_NAME || 'rentivo_migrations_lock';
  try {
    const lrows: any = await query('SELECT GET_LOCK(?, 10) as got', [lockName]);
    const got = lrows && lrows[0] && (lrows[0].got === 1 || lrows[0].got === '1');
    if (!got) throw new Error(`Could not acquire lock ${lockName}`);
  } catch (e) {
    console.error('Failed to acquire lock before migrate:fresh', e);
    process.exit(1);
  }

  try {
    console.log('Collecting tables to drop...');
    // disable foreign key checks to allow dropping tables in any order
    try { await query('SET FOREIGN_KEY_CHECKS = 0'); } catch (_) {}

    const rows: any[] = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE'");
    const names = rows.map(r => r.table_name).filter(Boolean);
    if (!names.length) console.log('No tables found in database.');
    else {
      console.log('Dropping tables:', names.join(', '));
      for (const n of names) {
        try {
          await query(`DROP TABLE IF EXISTS \`${n}\``);
        } catch (e) {
          console.warn('Failed to drop table', n, e);
        }
      }
    }

    // re-enable foreign key checks after dropping
    try { await query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}

    // release lock before running migrations runner which will re-acquire lock
    try { await query('SELECT RELEASE_LOCK(?)', [lockName]); } catch (_) {}

    // run migrations (this will acquire lock again)
    console.log('Running migrations...');
    const mmod = require('./run-migrations');
    if (mmod && typeof mmod.run === 'function') {
      await mmod.run();
    } else {
      throw new Error('run-migrations module does not export run()');
    }

    // optionally run seeders
    if (args.seed) {
      console.log('Running seeders...');
      const smod = require('./run-seeders');
      if (smod && typeof smod.runWithOptions === 'function') {
        await smod.runWithOptions({ class: args.seederClass });
      } else if (smod && typeof smod.run === 'function') {
        await smod.run();
      } else {
        console.warn('Seeder runner not available');
      }
    }

    console.log('migrate:fresh complete');
  } finally {
    try { await query('SELECT RELEASE_LOCK(?)', [lockName]); } catch (_) {}
    // ensure foreign key checks are enabled
    try { await query('SET FOREIGN_KEY_CHECKS = 1'); } catch (_) {}
  }
}

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}

module.exports = run;
