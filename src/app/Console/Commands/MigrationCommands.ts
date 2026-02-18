import { Command } from '@/eloquent/Command/Command';
import { ArgumentsCamelCase } from 'yargs';
import fs from 'fs';
import path from 'path';
import { runMigrations, migrateFresh, runSeeders } from '@/database';

export class MigrateCommand extends Command {
    protected signature = 'migrate';
    protected description = 'Run the database migrations';

    protected options = {
        step: {
            type: 'number' as const,
            description: 'Number of migrations to run',
            default: 0,
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        this.info('Running migrations...');
        try {
            await runMigrations();
            this.info('Migrations completed successfully.');
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
        },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        this.warn('Dropping all tables and re-running migrations...');
        try {
            await migrateFresh();
            this.info('Fresh migration completed successfully.');

            if (args.seed) {
                this.info('Running seeders...');
                await runSeeders();
                this.info('Seeding completed successfully.');
            }
        } catch (error: any) {
            this.error(`Fresh migration failed: ${error.message}`);
            process.exit(1);
        }
    }
}

export class MigrateRollbackCommand extends Command {
    protected signature = 'migrate:rollback';
    protected description = 'Rollback the last database migration';

    protected options = {
        step: {
            type: 'number' as const,
            description: 'Number of migrations to rollback',
            default: 1,
        },
    };

    async handle(args: ArgumentsCamelCase): Promise<void> {
        const steps = args.step as number || 1;
        this.info(`Rolling back ${steps} migration(s)...`);
        this.warn('Rollback not yet implemented. Use migrate:fresh for now.');
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
export async function up(schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('${table}', (table: TableBuilder) => {
        // Add columns, indexes, foreign keys here
    });
}

export async function down(schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('${table}', (table: TableBuilder) => {
        // Reverse operations here
    });
}
`;
        }

        return `import type { MigrationSchema, TableBuilder } from '@/database';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: ${name}
export async function up(schema: MigrationSchema, query: QueryFn) {
    return schema.createTable('${tbl}', (table: TableBuilder) => {
        table.id();
        table.timestamps();
    });
}

export async function down(schema: MigrationSchema, query: QueryFn) {
    return schema.dropTableIfExists('${tbl}');
}
`;
    }
}

