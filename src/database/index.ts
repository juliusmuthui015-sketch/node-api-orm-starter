/*
|--------------------------------------------------------------------------
| Database Index
|--------------------------------------------------------------------------
|
| Export database utilities, Schema, and migration/seeder runners.
|
*/

export { default as Schema, MongoSchema } from './Schema';
export type { MigrationSchema, TableBuilder, Column } from './Schema';

// Re-export the run functions by importing and executing the scripts
import { query, initDatabase, getDbType, getMongoDb } from '@/config/db.config';

// Export database utilities
export { query, initDatabase, getDbType, getMongoDb };

// Export migration runner function
export async function runMigrations(): Promise<void> {
    // Dynamic require to run the migration script
    require('./run-migrations');
}

// Export fresh migration function
export async function migrateFresh(): Promise<void> {
    require('./migrate-fresh');
}

// Export seeder runner function
export async function runSeeders(): Promise<void> {
    require('./run-seeders');
}

// Export make migration function
export async function makeMigration(name: string): Promise<void> {
    process.argv = ['', '', name];
    require('./make-migration');
}
