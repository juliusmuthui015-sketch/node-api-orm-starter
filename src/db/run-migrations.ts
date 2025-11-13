import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import os from 'os';
import { query, initDatabase } from '../config/db.config';
import Schema from './Schema';

async function ensureMigrationsTable() {
  const sql = `CREATE TABLE IF NOT EXISTS \`migrations\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    checksum VARCHAR(128) DEFAULT NULL,
    batch INT NOT NULL,
    migrated_at DATETIME NOT NULL,
    ran_by VARCHAR(255) DEFAULT NULL,
    ran_host VARCHAR(255) DEFAULT NULL,
    ran_pid INT DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  await query(sql);

  // migration_locks table for auditing lock ownership
  const lockSql = `CREATE TABLE IF NOT EXISTS \`migration_locks\` (
    lock_name VARCHAR(255) PRIMARY KEY,
    owner VARCHAR(255) DEFAULT NULL,
    owner_pid INT DEFAULT NULL,
    acquired_at DATETIME DEFAULT NULL,
    released_at DATETIME DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  await query(lockSql);
}

async function acquireLock(lockName: string, timeoutSec = 10, retries = 5, backoffMs = 1000) {
  let attempt = 0;
  while (true) {
    attempt++;
    console.log(`Attempting to acquire migration lock '${lockName}' (timeout ${timeoutSec}s) attempt ${attempt}/${retries}`);
    const rows: any[] = await query('SELECT GET_LOCK(?, ?) as got', [lockName, timeoutSec]);
    const got = rows && rows[0] && (rows[0].got === 1 || rows[0].got === '1');
    if (got) {
      console.log(`Acquired migration lock '${lockName}'`);
      // insert/update lock audit
      try {
        const owner = process.env.USER || os.userInfo().username || null;
        const pid = process.pid;
        await query('INSERT INTO `migration_locks` (lock_name, owner, owner_pid, acquired_at, released_at) VALUES (?, ?, ?, NOW(), NULL) ON DUPLICATE KEY UPDATE owner = ?, owner_pid = ?, acquired_at = NOW(), released_at = NULL', [lockName, owner, pid, owner, pid]);
      } catch (e) { console.warn('Failed to record lock acquisition:', e); }
      return;
    }
    if (attempt >= retries) break;
    const wait = backoffMs * Math.pow(2, attempt - 1);
    console.log(`Lock not acquired, retrying after ${wait}ms`);
    await new Promise(res => setTimeout(res, wait));
  }
  throw new Error(`Could not acquire migration lock '${lockName}' after ${retries} attempts`);
}

async function releaseLock(lockName: string) {
  try {
    const rows: any[] = await query('SELECT RELEASE_LOCK(?) as released', [lockName]);
    const released = rows && rows[0] && (rows[0].released === 1 || rows[0].released === '1');
    console.log(`Released migration lock '${lockName}' (released=${released})`);
    try {
      await query('UPDATE `migration_locks` SET released_at = NOW() WHERE lock_name = ?', [lockName]);
    } catch (e) { /* ignore */ }
  } catch (e) {
    // ignore
  }
}

function checksumOf(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function parseArgs(argv: string[]) {
  const out: any = { command: 'up', lockName: 'rentivo_migrations_lock', lockTimeout: 10, lockRetries: undefined, lockBackoffMs: undefined, forceConfirm: false, force: false, step: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'down' || a === 'rollback') out.command = 'down';
    else if (a === 'up' || a === 'migrate') out.command = 'up';
    else if (a.startsWith('--step=')) out.step = parseInt(a.split('=')[1], 10) || 1;
    else if (a.startsWith('--lock-name=')) out.lockName = a.split('=')[1];
    else if (a.startsWith('--lock-timeout=')) out.lockTimeout = parseInt(a.split('=')[1], 10) || 10;
    else if (a.startsWith('--lock-retries=')) out.lockRetries = parseInt(a.split('=')[1], 10) || undefined;
    else if (a.startsWith('--lock-backoff-ms=')) out.lockBackoffMs = parseInt(a.split('=')[1], 10) || undefined;
    else if (a === '--force-confirm') out.forceConfirm = true;
    else if (a === '--force') out.force = true;
  }
  return out;
}

async function promptConfirm(question: string) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans: string = await new Promise(res => rl.question(question + ' ', a => { rl.close(); res(a); }));
  return /^y(es)?$/i.test(ans.trim());
}

async function getAppliedMigrations() {
  const rows: any[] = await query('SELECT name, checksum, batch, migrated_at, ran_by, ran_host FROM `migrations` ORDER BY id');
  const map: Record<string, any> = {};
  for (const r of rows) map[r.name] = r;
  return { rows, map };
}

async function getCurrentMaxBatch() {
  const rows: any[] = await query('SELECT MAX(batch) as maxBatch FROM `migrations`');
  return (rows && rows[0] && rows[0].maxBatch) || 0;
}

async function runSql(sql: string) {
  // rely on mysql2 pool with multipleStatements enabled
  await query(sql);
}

async function run() {
  await initDatabase();

  // Ensure migrations tables exist BEFORE attempting to acquire a lock.
  // acquireLock inserts into `migration_locks`, so the table must be present first.
  await ensureMigrationsTable();

  const args = parseArgs(process.argv);

  // checksum policy comes from env var MIGRATION_CHECKSUM_POLICY (strict|warn|ignore)
  const checksumPolicy = (process.env.MIGRATION_CHECKSUM_POLICY || 'strict').toLowerCase();

  // lock config: env vars can set defaults, CLI overrides available
  const lockName = args.lockName || process.env.MIGRATION_LOCK_NAME || 'rentivo_migrations_lock';
  const lockTimeout = args.lockTimeout || parseInt(process.env.MIGRATION_LOCK_TIMEOUT || '10', 10) || 10;
  const lockRetries = args.lockRetries || parseInt(process.env.MIGRATION_LOCK_RETRIES || '5', 10) || 5;
  const lockBackoffMs = args.lockBackoffMs || parseInt(process.env.MIGRATION_LOCK_BACKOFF_MS || '1000', 10) || 1000;

  await acquireLock(lockName, lockTimeout, lockRetries, lockBackoffMs);

  try {
    await ensureMigrationsTable();

    const dir = path.resolve(__dirname, './migrations');
    // prefer .ts/.js migrations; SQL migrations are deprecated and ignored
    const allFiles = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    const bases = new Map<string, string>();
    // prioritize ts, then js
    for (const ext of ['.ts', '.js']) {
      for (const f of allFiles.filter(x => x.endsWith(ext))) {
        const base = f.replace(/\.(ts|js|sql)$/i, '');
        if (!bases.has(base)) bases.set(base, f);
      }
    }
    const files = Array.from(bases.values()).sort();
    // detect and warn about remaining .sql files so maintainers can remove them
    const legacySql = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    if (legacySql.length) console.warn('Found legacy .sql migrations (ignored):', legacySql.join(', '));

    if (args.command === 'up') {
      const { map } = await getAppliedMigrations();
      const maxBatch = await getCurrentMaxBatch();
      const newBatch = (maxBatch || 0) + 1;

      // pre-scan for checksum mismatches to allow single confirmation
      const mismatches: string[] = [];
      for (const f of files) {
        const full = path.join(dir, f);
        if (!map[f]) continue;
        let content = '';
        try { content = fs.readFileSync(full, 'utf8'); } catch (e) { content = ''; }
        const ch = checksumOf(content);
        if (map[f].checksum && map[f].checksum !== ch) mismatches.push(f);
      }

      if (mismatches.length) {
        if (args.force) {
          console.warn('Checksum mismatches detected but --force provided — proceeding for all mismatches:', mismatches.join(', '));
        } else if (args.forceConfirm) {
          const ok = await promptConfirm(`Checksum mismatches detected for applied migrations: ${mismatches.join(', ')}. Proceed and ignore all mismatches? (y/N)`);
          if (!ok) throw new Error('User aborted due to checksum mismatches');
          console.warn('User confirmed proceeding despite checksum mismatches');
        } else if (checksumPolicy === 'ignore') {
          console.warn('Checksum mismatches detected but MIGRATION_CHECKSUM_POLICY=ignore — proceeding. Files:', mismatches.join(', '));
        } else if (checksumPolicy === 'warn') {
          console.warn('Checksum mismatches detected (policy=warn). These migrations will be skipped:', mismatches.join(', '));
        } else {
          throw new Error(`Checksum mismatches detected for applied migrations: ${mismatches.join(', ')}. Aborting (set MIGRATION_CHECKSUM_POLICY or use --force/--force-confirm).`);
        }
      }

      for (const f of files) {
        const full = path.join(dir, f);

        // compute checksum of current file
        let content = '';
        try { content = fs.readFileSync(full, 'utf8'); } catch (e) { content = ''; }
        const ch = checksumOf(content);

        if (map[f]) {
          // checksum changed since applied → obey checksum policy (already handled in pre-scan)
          if (map[f].checksum && map[f].checksum !== ch) {
            if (args.force || args.forceConfirm || checksumPolicy === 'ignore') {
              console.warn(`Proceeding despite checksum mismatch for ${f}`);
            } else if (checksumPolicy === 'warn') {
              console.log('Skipping already applied migration', f);
              continue;
            } else {
              throw new Error(`Checksum mismatch for already-applied migration ${f}. File was changed after applying. Aborting.`);
            }
          }
          console.log('Skipping already applied migration', f);
          continue;
        }

        console.log('Applying migration', f);
        if (f.endsWith('.js') || f.endsWith('.ts')) {
          if (f.endsWith('.ts')) {
            try { require('ts-node/register/transpile-only'); } catch (e) {}
          }
          const mod = require(path.join(dir, f));
          if (mod && typeof mod.up === 'function') {
            const schema = new Schema();
            const res = await mod.up(schema, query);
            if (typeof res === 'string') await runSql(res);
            const ranBy = process.env.USER || os.userInfo().username || null;
            const ranHost = os.hostname();
            const pid = process.pid;
            await query('INSERT INTO `migrations` (name, checksum, batch, migrated_at, ran_by, ran_host, ran_pid) VALUES (?, ?, ?, NOW(), ?, ?, ?)', [f, ch, newBatch, ranBy, ranHost, pid]);
          } else {
            throw new Error(`Migration ${f} does not export an up(schema, query) function`);
          }
        } else {
          // should not happen due to initial filter; safeguard log
          console.warn('Ignoring unsupported migration file type:', f);
        }
      }

      console.log('Migrations applied (batch', newBatch + ')');
      return;
    }

    // down / rollback (unchanged logic below)
    if (args.command === 'down') {
      const step = args.step || 1;
      // get distinct batches descending
      const batchesRows: any[] = await query('SELECT DISTINCT batch FROM `migrations` ORDER BY batch DESC');
      if (!batchesRows.length) { console.log('No migrations to rollback'); return; }
      const batches = batchesRows.map(r => r.batch).slice(0, step);
      if (!batches.length) { console.log('No batches to rollback'); return; }

      // get migrations in those batches ordered by id desc
      const placeholders = batches.map(() => '?').join(',');
      const rows: any[] = await query(`SELECT id, name, checksum, batch FROM \`migrations\` WHERE batch IN (${placeholders}) ORDER BY id DESC`, batches);
      if (!rows.length) { console.log('No migrations found for requested batches'); return; }

      // rollback in reverse order (last applied first)
      for (const r of rows) {
        const f = r.name;
        const full = path.join(dir, f);
        console.log('Reverting migration', f);
        if (fs.existsSync(full) && (f.endsWith('.js') || f.endsWith('.ts'))) {
          if (f.endsWith('.ts')) {
            try { require('ts-node/register/transpile-only'); } catch (e) {}
          }
          const mod = require(full);
          if (mod && typeof mod.down === 'function') {
            const schema = new Schema();
            const res = await mod.down(schema, query);
            if (typeof res === 'string') await runSql(res);
            await query('DELETE FROM `migrations` WHERE name = ?', [f]);
            continue;
          } else {
            throw new Error(`Migration ${f} does not export a down(schema, query) function; rollback aborted`);
          }
        }

        // SQL migrations are deprecated and ignored; expect a JS/TS migration with down() implemented
        throw new Error(`Cannot rollback migration ${f}: SQL migrations are deprecated. Provide a JS/TS migration with down(schema, query).`);
      }

      console.log('Rollback complete for batches', batches.join(','));
      return;
    }
  } finally {
    try { await releaseLock(lockName); } catch (e) { /* ignore */ }
  }
}

// expose run for programmatic use and only auto-run when executed directly
module.exports.run = run;

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}
