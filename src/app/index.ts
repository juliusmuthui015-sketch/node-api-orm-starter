/*
|--------------------------------------------------------------------------
| Application Index
|--------------------------------------------------------------------------
|
| This file provides a central export point for all application components.
| Following Laravel conventions, the app directory contains:
|
| - Console/     : Artisan commands and console kernel
| - Enums/       : Application enumerations
| - Helpers/     : Helper functions (auth, validation, etc.)
| - Http/        : Controllers, Middleware, and HTTP kernel
| - Models/      : Eloquent models
| - Observers/   : Model observers
| - Providers/   : Service providers
| - Services/    : Business logic services
|
*/

// Application container
export { Application } from './Providers/Application';

// Service Providers
export { AppServiceProvider } from './Providers/AppServiceProvider';
export { RouteServiceProvider } from './Providers/RouteServiceProvider';

// HTTP Kernel
export { Kernel as HttpKernel } from './Http/Kernel';

// Console Kernel
export { Kernel as ConsoleKernel } from '../eloquent/Command/Kernel/Kernel';

