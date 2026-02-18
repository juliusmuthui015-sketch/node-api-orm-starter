#!/usr/bin/env ts-node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import MockSeeder from './MockSeeder';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('users', { type: 'number', default: 5, describe: 'How many extra users to create' })
    .option('properties', {
      type: 'number',
      default: 30,
      describe: 'How many properties to create',
    })
    .option('unitTypesPerProperty', {
      type: 'number',
      default: 5,
      describe: 'Unit types per property',
    })
    .option('unitsPerProperty', { type: 'number', default: 60, describe: 'Units per property' })
    .help()
    .parse();

  await MockSeeder({
    users: argv.users as number,
    properties: argv.properties as number,
    unitTypesPerProperty: argv.unitTypesPerProperty as number,
    unitsPerProperty: argv.unitsPerProperty as number,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
