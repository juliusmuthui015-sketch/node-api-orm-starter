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

// Migration options interface
export interface MigrationOptions {
    step?: number;
    force?: boolean;
    forceConfirm?: boolean;
    command?: 'up' | 'down';
}

// Seeder options interface
export interface SeederOptions {
    class?: string;
    force?: boolean;
}

// Export migration runner function
export async function runMigrations(options: MigrationOptions = {}): Promise<void> {
    // Dynamic require to run the migration script
    const { run } = require('./run-migrations');
    if (run) {
        await run({
            command: options.command || 'up',
            step: options.step,
            force: options.force,
            forceConfirm: options.forceConfirm,
        });
    }
}

// Export fresh migration function
export async function migrateFresh(options: { seed?: boolean } = {}): Promise<void> {
    const { run } = require('./migrate-fresh');
    if (run) {
        await run(options);
    }
}

// Export seeder runner function
export async function runSeeders(options: SeederOptions = {}): Promise<void> {
    const { run } = require('./run-seeders');
    if (run) {
        await run(options);
    }
}

// Export rollback function
export async function rollbackMigrations(options: { step?: number } = {}): Promise<void> {
    const { run } = require('./run-migrations');
    if (run) {
        await run({
            command: 'down',
            step: options.step || 1,
        });
    }
}

// Export make migration function
export async function makeMigration(name: string): Promise<void> {
    process.argv = ['', '', name];
    require('./make-migration');

}
