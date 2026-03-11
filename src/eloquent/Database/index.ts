/*
|--------------------------------------------------------------------------
| Eloquent Database Module
|--------------------------------------------------------------------------
|
| This module provides Laravel-like database migration and seeding system.
| It exports Schema builders, migration runners, and seeder utilities.
|
*/

// Schema exports
export {
  default as Schema,
  MongoSchema,
  Column,
  TableBuilder,
  RawExpression,
  raw
} from './Schema';

export type { MigrationSchema, Migration } from './Schema';

// Migration runner exports
export { run as runMigrations } from './MigrationRunner';

// Seeder runner exports
export { run as runSeeders } from './SeederRunner';
export type { SeederOptions } from './SeederRunner';

// Migrate fresh exports
export { run as migrateFresh } from './MigrateFresh';

// Re-export database utilities from config
import { query, initDatabase, getDbType, getMongoDb } from '@/config/db.config';
export { query, initDatabase, getDbType, getMongoDb };

// Migration options interface
export interface MigrationOptions {
  step?: number;
  force?: boolean;
  forceConfirm?: boolean;
  command?: 'up' | 'down';
}

// Export rollback function
export async function rollbackMigrations(options: { step?: number } = {}): Promise<void> {
  const { run } = require('./MigrationRunner');
  if (run) {
    await run({
      command: 'down',
      step: options.step || 1,
    });
  }
}

// Export make migration function
export async function makeMigration(name: string, options?: { table?: string; alter?: boolean }): Promise<void> {
  const args = ['', '', name];
  if (options?.table) args.push(`--table=${options.table}`);
  if (options?.alter) args.push('--alter');
  process.argv = args;
  require('./MakeMigration');
}

