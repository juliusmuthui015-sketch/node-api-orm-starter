/*
|--------------------------------------------------------------------------
| Application Entry Point
|--------------------------------------------------------------------------
|
| This is the entry point for the application. It simply calls the
| startApplication function from bootstrap/app.ts which handles:
|
| 1. Database initialization
| 2. Cache initialization
| 3. Service provider registration (AppServiceProvider, RouteServiceProvider)
| 4. HTTP Kernel boot (middleware registration)
| 5. Application bootstrap (routes mounted via RouteServiceProvider)
| 6. Error handling configuration
| 7. Server startup
|
*/

import { startApplication } from '@/bootstrap/app';

// Start the application
startApplication();
