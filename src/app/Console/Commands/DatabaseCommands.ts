import { Command } from '@/eloquent/Command/Command';
import { ArgumentsCamelCase } from 'yargs';
import { runSeeders } from '@/database';

export class DbSeedCommand extends Command {
    protected signature = 'db:seed';
    protected description = 'Seed the database with records';

    protected options = {
        class: {
            type: 'string' as const,
            description: 'The class name of the seeder to run',
        },
        force: {
            type: 'boolean' as const,
            description: 'Force the operation to run in production',
            default: false,
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        this.info('Seeding database...');
        try {
            await runSeeders();
            this.info('Database seeding completed successfully.');
        } catch (error: any) {
            this.error(`Seeding failed: ${error.message}`);
            process.exit(1);
        }
    }
}

export class DbWipeCommand extends Command {
    protected signature = 'db:wipe';
    protected description = 'Drop all tables, views, and types';

    protected options = {
        force: {
            type: 'boolean' as const,
            description: 'Force the operation to run in production',
            default: false,
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        this.warn('This command will drop all tables!');
        this.warn('Not yet implemented. Use migrate:fresh instead.');
    }
}
