import yargs, { Argv, ArgumentsCamelCase } from 'yargs';

export interface CommandSignature {
    name: string;
    description: string;
    arguments?: Record<string, { type: 'string' | 'number' | 'boolean'; description?: string; required?: boolean }>;
    options?: Record<string, { type: 'string' | 'number' | 'boolean'; description?: string; default?: any; alias?: string }>;
}

export abstract class Command {
    /*
    |--------------------------------------------------------------------------
    | The name and signature of the console command
    |--------------------------------------------------------------------------
    */
    protected abstract signature: string;

    /*
    |--------------------------------------------------------------------------
    | The console command description
    |--------------------------------------------------------------------------
    */
    protected abstract description: string;

    /*
    |--------------------------------------------------------------------------
    | Command Arguments
    |--------------------------------------------------------------------------
    */
    protected arguments: CommandSignature['arguments'] = {};

    /*
    |--------------------------------------------------------------------------
    | Command Options
    |--------------------------------------------------------------------------
    */
    protected options: CommandSignature['options'] = {};

    /*
    |--------------------------------------------------------------------------
    | Execute the console command
    |--------------------------------------------------------------------------
    */
    abstract handle(args: ArgumentsCamelCase): Promise<void>;

    /*
    |--------------------------------------------------------------------------
    | Register the command with yargs
    |--------------------------------------------------------------------------
    */
    register(): void {
        // This will be called by the Kernel to register commands
    }

    /*
    |--------------------------------------------------------------------------
    | Build command for yargs
    |--------------------------------------------------------------------------
    */
    buildCommand(yargs: Argv): Argv {
        return yargs.command(
            this.signature,
            this.description,
            (y: Argv) => {
                // Add arguments
                if (this.arguments) {
                    for (const [name, config] of Object.entries(this.arguments)) {
                        y.positional(name, {
                            type: config.type,
                            describe: config.description,
                            demandOption: config.required,
                        });
                    }
                }

                // Add options
                if (this.options) {
                    for (const [name, config] of Object.entries(this.options)) {
                        y.option(name, {
                            type: config.type,
                            describe: config.description,
                            default: config.default,
                            alias: config.alias,
                        });
                    }
                }

                return y;
            },
            async (args: ArgumentsCamelCase) => {
                await this.handle(args);
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Output helpers
    |--------------------------------------------------------------------------
    */
    protected info(message: string): void {
        console.log(`\x1b[32m${message}\x1b[0m`);
    }

    protected error(message: string): void {
        console.error(`\x1b[31m${message}\x1b[0m`);
    }

    protected warn(message: string): void {
        console.warn(`\x1b[33m${message}\x1b[0m`);
    }

    protected line(message: string): void {
        console.log(message);
    }

    protected newLine(count: number = 1): void {
        for (let i = 0; i < count; i++) {
            console.log('');
        }
    }

    protected table(headers: string[], rows: string[][]): void {
        // Simple table output
        const colWidths = headers.map((h, i) =>
            Math.max(h.length, ...rows.map(r => (r[i] || '').length))
        );

        const separator = colWidths.map(w => '-'.repeat(w + 2)).join('+');
        const formatRow = (row: string[]) =>
            row.map((cell, i) => ` ${(cell || '').padEnd(colWidths[i])} `).join('|');

        console.log(separator);
        console.log(formatRow(headers));
        console.log(separator);
        rows.forEach(row => console.log(formatRow(row)));
        console.log(separator);
    }
}

