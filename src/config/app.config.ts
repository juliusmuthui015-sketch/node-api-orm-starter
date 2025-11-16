import dotenv from 'dotenv';
import path from 'path';

// ensure .env loaded if this module is imported directly
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const CACHE_DRIVER = (process.env.CACHE_DRIVER || 'file').toLowerCase();
export const CACHE_PREFIX = process.env.CACHE_PREFIX || '';
export const SKIP_CACHE = String(process.env.SKIP_CACHE || '').toLowerCase() === '1' || String(process.env.SKIP_CACHE || '').toLowerCase() === 'true';

export const APP_KEY = process.env.APP_KEY || '';

export default {
  cache: {
    driver: CACHE_DRIVER,
    prefix: CACHE_PREFIX,
    skip: SKIP_CACHE
  },
  appKey: APP_KEY
};

