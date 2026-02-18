#!/usr/bin/env ts-node
/*
|--------------------------------------------------------------------------
| Artisan Console
|--------------------------------------------------------------------------
|
| This is the main entry point for the Artisan CLI. It loads commands
| via the Console Kernel which auto-scans the Commands directory.
|
*/

import 'dotenv/config';
import '@/global/autoload';

// Boot HTTP Kernel FIRST to register middleware (needed before routes are imported)
import { container } from '@/eloquent/Container/Container';
import { Application } from '@/app/Providers/Application';
import { Kernel as HttpKernel } from '@/app/Http/Kernel';

const app = new Application(container);
const httpKernel = new HttpKernel(app);
httpKernel.boot(); // Registers middleware aliases like 'auth', 'can', 'role', etc.

// Now import the rest (Commands will import routes which need middleware registered)
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initCache } from '@/cache';
import { initDatabase } from '@/config/db.config';
import { Kernel } from '@/eloquent/Command/Kernel/Kernel';

/*
|--------------------------------------------------------------------------
| Initialize Application
|--------------------------------------------------------------------------
*/
async function initApp() {
    const skipDb = String(process.env.SKIP_DB || '').toLowerCase();
    if (skipDb !== '1' && skipDb !== 'true') {
        try {
            await initDatabase();
        } catch (e) {
            // Database init failed, continue anyway for non-db commands
        }
    }

    const skipCache = String(process.env.SKIP_CACHE || '').toLowerCase();
    if (skipCache !== '1' && skipCache !== 'true') {
        try {
            await initCache();
        } catch (e) {
            // Cache init failed, continue anyway
        }
    }
}

/*
|--------------------------------------------------------------------------
| Main CLI
|--------------------------------------------------------------------------
*/
async function main() {
    await initApp();

    // Create Console Kernel
    const kernel = new Kernel();
    kernel.boot();

    // Setup Yargs
    let cli = yargs(hideBin(process.argv))
        .scriptName('artisan')
        .usage('$0 <command> [options]');

    // Register all commands via Kernel
    cli = kernel.registerCommands(cli);

    // Parse and execute
    cli
        .demandCommand(1, 'Please specify a command. Use --help for usage.')
        .strict()
        .help()
        .alias('h', 'help')
        .version(false)
        .parse();
}

main().catch((err) => {
    console.error('Artisan error:', err);
    process.exit(1);
});
