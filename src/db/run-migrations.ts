import fs from 'fs';
import path from 'path';
import { query, initDatabase } from '../config/db.config';

async function run() {
  await initDatabase();
  const dir = path.resolve(__dirname, './migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log('Running migration', f);
    await query(sql);
  }
  console.log('Migrations complete');
}

run().catch(err => { console.error(err); process.exit(1); });

