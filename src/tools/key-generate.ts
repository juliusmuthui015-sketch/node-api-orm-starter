#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function makeAppKey(): string {
  // 32 random bytes base64 encoded
  const raw = crypto.randomBytes(32).toString('base64');
  return 'base64:' + raw;
}

function updateEnvFile(envPath: string, newKey: string, force: boolean): { updated: boolean; message: string } {
  let content = '';
  let exists = fs.existsSync(envPath);
  if (exists) content = fs.readFileSync(envPath, 'utf8');
  const hasKey = /^APP_KEY=.+/m.test(content);

  if (hasKey && !force) {
    // replace only if force
    return { updated: false, message: 'APP_KEY already exists. Use --force to overwrite.' };
  }

  if (hasKey) {
    content = content.replace(/^APP_KEY=.+/m, `APP_KEY=${newKey}`);
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += `APP_KEY=${newKey}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  return { updated: true, message: `APP_KEY written to ${envPath}` };
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('write', { type: 'boolean', describe: 'Write/append APP_KEY to .env if not present', default: false })
    .option('force', { type: 'boolean', describe: 'Overwrite existing APP_KEY', default: false })
    .option('display-only', { type: 'boolean', describe: 'Only display generated key; do not write', default: false })
    .help()
    .parseSync() as { write: boolean; force: boolean; 'display-only': boolean; displayOnly: boolean };

  const key = makeAppKey();
  console.log(key);

  if (argv.displayOnly || (argv['display-only'])) {
    return;
  }

  if (argv.write) {
    const envPath = path.resolve(process.cwd(), '.env');
    const res = updateEnvFile(envPath, key, argv.force);
    console.log(res.message);
  } else {
    console.log('Use --write to persist this key to .env');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
