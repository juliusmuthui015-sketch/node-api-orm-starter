import { Argv } from 'yargs';
import { Command } from '@/eloquent/Command/Command';

// Import all commands from the index
import * as Commands from '@/app/Console/Commands';
import path from "path";

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
    | Get All Command Instances
    |--------------------------------------------------------------------------
    |
    | Auto-scans the Commands directory and returns all command instances.
    |
    */
    getCommands(): Command[] {
        const commandInstances: Command[] = [];

        // Get commands from the imported Commands module
        for (const [name, CommandClass] of Object.entries(Commands)) {
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

        // Add manually registered commands
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
    |
    */
    protected schedule(): void {
        // Define scheduled commands here
        // e.g., this.command('cache:clear').daily();
    }

    /*
    |--------------------------------------------------------------------------
    | Boot
    |--------------------------------------------------------------------------
    */
    boot(): void {
        this.schedule();
    }
}
