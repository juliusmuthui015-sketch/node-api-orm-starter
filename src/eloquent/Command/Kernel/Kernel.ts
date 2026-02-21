import { Argv } from 'yargs';
import { Command } from '@/eloquent/Command/Command';

// Import system/framework commands from eloquent
import * as SystemCommands from '../Commands';

// Import application-specific commands
import * as AppCommands from '@app/Console/Commands';

import path from "path";
import { scheduler, Schedule } from '@/eloquent/Queue';

// Import QueueServiceProvider to register scheduled tasks
import { QueueServiceProvider } from '@/app/Providers/QueueServiceProvider';
import { container } from '@/eloquent/Container/Container';
import { Application } from '@/app/Providers/Application';

export class Kernel {
    /*
    |--------------------------------------------------------------------------
    | Manually Registered Commands
    |--------------------------------------------------------------------------
    |
    | You can manually add command classes here if needed.
    | Commands in the Commands directory are auto-loaded.
    |
    */
    protected commands: Array<new () => Command> = [];

    /*
    |--------------------------------------------------------------------------
    | Commands Directory Path
    |--------------------------------------------------------------------------
    */
    protected commandsPath: string = path.resolve(__dirname, 'Commands');

    /*
    |--------------------------------------------------------------------------
    | Scheduler Instance
    |--------------------------------------------------------------------------
    */
    protected scheduler: Schedule = scheduler;

    /*
    |--------------------------------------------------------------------------
    | Get All Command Instances
    |--------------------------------------------------------------------------
    |
    | Returns all command instances from:
    | 1. System commands (eloquent/Command/Commands)
    | 2. Application commands (app/Console/Commands)
    | 3. Manually registered commands
    |
    */
    getCommands(): Command[] {
        const commandInstances: Command[] = [];

        // 1. Get system/framework commands from eloquent
        for (const [name, CommandClass] of Object.entries(SystemCommands)) {
            if (
                typeof CommandClass === 'function' &&
                CommandClass.prototype instanceof Command
            ) {
                try {
                    const instance = new (CommandClass as new () => Command)();
                    commandInstances.push(instance);
                } catch (e) {
                    // Skip if instantiation fails
                }
            }
        }

        // 2. Get application-specific commands
        for (const [name, CommandClass] of Object.entries(AppCommands)) {
            if (
                typeof CommandClass === 'function' &&
                CommandClass.prototype instanceof Command
            ) {
                try {
                    const instance = new (CommandClass as new () => Command)();
                    commandInstances.push(instance);
                } catch (e) {
                    // Skip if instantiation fails
                }
            }
        }

        // 3. Add manually registered commands
        for (const CommandClass of this.commands) {
            try {
                const instance = new CommandClass();
                commandInstances.push(instance);
            } catch (e) {
                // Skip if instantiation fails
            }
        }

        return commandInstances;
    }

    /*
    |--------------------------------------------------------------------------
    | Register Commands with Yargs
    |--------------------------------------------------------------------------
    */
    registerCommands(cli: Argv): Argv {
        const commands = this.getCommands();
        for (const command of commands) {
            cli = command.buildCommand(cli);
        }
        return cli;
    }

    /*
    |--------------------------------------------------------------------------
    | Add a Command
    |--------------------------------------------------------------------------
    */
    addCommand(command: new () => Command): void {
        this.commands.push(command);
    }

    /*
    |--------------------------------------------------------------------------
    | Schedule
    |--------------------------------------------------------------------------
    |
    | Define the application's command schedule.
    | Override this method in your app's Kernel to define scheduled tasks.
    |
    | Examples:
    |   this.scheduler.command('cache:clear').daily();
    |   this.scheduler.command('invoice:mark-overdue').dailyAt('00:00');
    |   this.scheduler.call(async () => { ... }).everyFiveMinutes();
    |
    */
    protected schedule(): void {
        // Define scheduled commands here
        // Example: this.scheduler.command('cache:clear').daily();
        // Example: this.scheduler.command('invoice:mark-overdue').dailyAt('00:00');
    }

    /*
    |--------------------------------------------------------------------------
    | Boot
    |--------------------------------------------------------------------------
    */
    boot(): void {
        // Initialize QueueServiceProvider to register scheduled tasks
        try {
            const app = new Application(container);
            const queueProvider = new QueueServiceProvider(app);
            queueProvider.register();
            queueProvider.boot();
        } catch (e) {
            // QueueServiceProvider boot failed, continue anyway
        }

        this.schedule();
    }

    /*
    |--------------------------------------------------------------------------
    | Get Scheduler
    |--------------------------------------------------------------------------
    */
    getScheduler(): Schedule {
        return this.scheduler;
    }
}
