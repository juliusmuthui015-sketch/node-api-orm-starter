import { Command } from '@/eloquent/Command/Command';
import { ArgumentsCamelCase } from 'yargs';
import fs from 'fs';
import path from 'path';
import { runMigrations, migrateFresh, runSeeders, rollbackMigrations } from '@/database';

export class MigrateCommand extends Command {
    protected signature = 'migrate';
    protected description = 'Run the database migrations';

    protected options = {
        step: {
            type: 'number' as const,
            description: 'Number of migrations to run',
            default: 0,
        },
        force: {
            type: 'boolean' as const,
            description: 'Force migrations to run, ignoring checksum mismatches',
            default: false,
            alias: 'f',
        },
        'force-confirm': {
            type: 'boolean' as const,
            description: 'Prompt for confirmation on checksum mismatches',
            default: false,
            alias: 'fc',
        },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        this.info('Running migrations...');

        // Get options directly from args (yargs parsed) as well as this.option for flexibility
        const force = args.force === true || this.option<boolean>('force', false);
        const forceConfirm = args['force-confirm'] === true || args.forceConfirm === true || this.option<boolean>('force-confirm', false);
        const step = (args.step as number) || this.option<number>('step', 0);

        if (force) {
            this.warn('Force mode enabled - checksum mismatches will be ignored');
        }

        try {
            await runMigrations({
                command: 'up',
                step: step || undefined,
                force,
                forceConfirm,
            });
            this.success('Migrations completed successfully.');
        } catch (error: any) {
            this.error(`Migration failed: ${error.message}`);
            process.exit(1);
        }
    }
}

export class MigrateFreshCommand extends Command {
    protected signature = 'migrate:fresh';
    protected description = 'Drop all tables and re-run all migrations';

    protected options = {
        seed: {
            type: 'boolean' as const,
            description: 'Run seeders after migration',
            default: false,
            alias: 's',
        },
        force: {
            type: 'boolean' as const,
            description: 'Force the operation without confirmation',
            default: false,
            alias: 'f',
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        const seed = this.option<boolean>('seed', false);
        const force = this.option<boolean>('force', false);

        if (!force) {
            this.warn('⚠️  This will DROP ALL TABLES and re-run migrations!');
            const confirmed = await this.confirm('Are you sure you want to continue?', false);
            if (!confirmed) {
                this.info('Operation cancelled.');
                return;
            }
        }

        this.warn('Dropping all tables and re-running migrations...');
        try {
            await migrateFresh({ seed });
            this.success('Fresh migration completed successfully.');

            if (seed) {
                this.info('Seeders were run as part of fresh migration.');
            }
        } catch (error: any) {
            this.error(`Fresh migration failed: ${error.message}`);
            process.exit(1);
        }
    }
}

export class MigrateRollbackCommand extends Command {
    protected signature = 'migrate:rollback';
    protected description = 'Rollback the last database migration batch';

    protected options = {
        step: {
            type: 'number' as const,
            description: 'Number of batches to rollback',
            default: 1,
            alias: 's',
        },
        force: {
            type: 'boolean' as const,
            description: 'Force rollback without confirmation',
            default: false,
            alias: 'f',
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        const step = this.option<number>('step', 1);
        const force = this.option<boolean>('force', false);

        if (!force) {
            this.warn(`⚠️  This will rollback ${step} migration batch(es)!`);
            const confirmed = await this.confirm('Are you sure you want to continue?', false);
            if (!confirmed) {
                this.info('Operation cancelled.');
                return;
            }
        }

        this.info(`Rolling back ${step} migration batch(es)...`);
        try {
            await rollbackMigrations({ step });
            this.success(`Rollback of ${step} batch(es) completed successfully.`);
        } catch (error: any) {
            this.error(`Rollback failed: ${error.message}`);
            process.exit(1);
        }
    }
}

export class MigrateStatusCommand extends Command {
    protected signature = 'migrate:status';
    protected description = 'Show the status of each migration';

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        this.info('Migration Status:');

        const dir = path.resolve(process.cwd(), 'src/database/migrations');

        if (!fs.existsSync(dir)) {
            this.warn('No migrations directory found.');
            return;
        }

        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
            .sort();

        if (files.length === 0) {
            this.info('No migration files found.');
            return;
        }

        // Get applied migrations from database (supports both MySQL and MongoDB)
        let appliedMigrations: Map<string, { batch: number }> = new Map();
        try {
            const { query, initDatabase, getDbType, getMongoDb } = require('@/config/db.config');
            await initDatabase();

            const dbType = getDbType();

            if (dbType === 'mongodb') {
                // MongoDB: Query the migrations collection
                const db = getMongoDb();
                const rows = await db
                    .collection('migrations')
                    .find({}, { projection: { _id: 0, name: 1, batch: 1 } })
                    .sort({ migrated_at: 1 })
                    .toArray();
                for (const r of rows) {
                    appliedMigrations.set(r.name, { batch: r.batch });
                }
            } else {
                // MySQL/SQL: Query the migrations table
                const rows: any[] = await query('SELECT name, batch FROM migrations ORDER BY id');
                for (const r of rows) {
                    appliedMigrations.set(r.name, { batch: r.batch });
                }
            }
        } catch (e: any) {
            this.warn(`Could not fetch migration status from DB: ${e.message}`);
        }

        this.line('');

        const rows = files.map(f => {
            const migration = appliedMigrations.get(f);
            const isApplied = !!migration;
            const status = isApplied
                ? `\x1b[32mRan\x1b[0m (batch ${migration!.batch})`
                : '\x1b[33mPending\x1b[0m';
            return [f, status];
        });

        const ran = files.filter(f => appliedMigrations.has(f)).length;
        const pending = files.length - ran;

        this.table(['Migration', 'Status'], rows);

        this.line('');
        this.info(`Total: ${files.length} migrations (${ran} ran, ${pending} pending)`);
    }
}

export class MakeMigrationCommand extends Command {
    protected signature = 'make:migration <name>';
    protected description = 'Create a new migration file';

    protected arguments = {
        name: { type: 'string' as const, description: 'The name of the migration', required: true },
    };

    protected options = {
        table: {
            type: 'string' as const,
            description: 'The table to be created/modified',
        },
        alter: {
            type: 'boolean' as const,
            description: 'Create an alter table migration',
            default: false,
        },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        const name = String(args.name);
        const table = args.table as string | undefined;
        const alter = args.alter as boolean;

        const timestamp = this.getTimestamp();
        const fileName = `${timestamp}_${name.replace(/\s+/g, '_')}.ts`;
        const dir = path.resolve(process.cwd(), 'src/database/migrations');

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const filePath = path.join(dir, fileName);
        const template = this.getTemplate(name, table, alter);

        fs.writeFileSync(filePath, template);
        this.info(`Created migration: ${fileName}`);
    }

    private getTimestamp(): string {
        const d = new Date();
        const pad = (n: number) => n < 10 ? '0' + n : String(n);
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    private getTemplate(name: string, table?: string, alter?: boolean): string {
        const tbl = table || name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

        if (alter && table) {
            return `import type { MigrationSchema, TableBuilder } from '@/database';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: ${name}
// Alter table ${table}
module.exports.up = async function (schema: MigrationSchema, _query: QueryFn) {
    return schema.alterTable('${table}', (table: TableBuilder) => {
        // Add columns, indexes, foreign keys here
    });
};

module.exports.down = async function (schema: MigrationSchema, _query: QueryFn) {
    return schema.alterTable('${table}', (table: TableBuilder) => {
        // Reverse operations here
    });
};
`;
        }

        return `import type { MigrationSchema, TableBuilder } from '@/database';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: ${name}
module.exports.up = async function (schema: MigrationSchema, _query: QueryFn) {
    return schema.createTable('${tbl}', (table: TableBuilder) => {
        table.increments('id');
        table.timestamps();
    });
};

module.exports.down = async function (schema: MigrationSchema, _query: QueryFn) {
    return schema.dropTable('${tbl}');
};
`;
    }
}

