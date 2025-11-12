import dotenv from 'dotenv';
import path from 'path';

// Load .env before other modules so process.env is available during module initialization
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export {};
