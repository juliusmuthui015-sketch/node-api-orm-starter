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
            alias: 'c',
        },
        force: {
            type: 'boolean' as const,
            description: 'Force the operation to run in production',
            default: false,
            alias: 'f',
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        const seederClass = this.option<string>('class');
        const force = this.option<boolean>('force', false);

        if (process.env.NODE_ENV === 'production' && !force) {
            this.error('Cannot run seeders in production without --force flag');
            process.exit(1);
        }

        this.info('Seeding database...');
        if (seederClass) {
            this.comment(`Running seeder: ${seederClass}`);
        }

        try {
            await runSeeders({ class: seederClass, force });
            this.success('Database seeding completed successfully.');
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
            alias: 'f',
        },
    };

    async handle(_args: ArgumentsCamelCase): Promise<void> {
        const force = this.option<boolean>('force', false);

        if (!force) {
            this.warn('⚠️  This command will DROP ALL TABLES!');
            const confirmed = await this.confirm('Are you sure you want to continue?', false);
            if (!confirmed) {
                this.info('Operation cancelled.');
                return;
            }
        }

        this.warn('Dropping all tables...');
        // TODO: Implement db:wipe
        this.warn('Not yet implemented. Use migrate:fresh instead.');
    }
}
