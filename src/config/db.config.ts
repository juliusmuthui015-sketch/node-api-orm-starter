import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { MongoClient, Db } from 'mongodb';

// Ensure .env is loaded if this module is imported directly (safety for various import orders)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbType = (process.env.DB_CONNECTION || process.env.DB_DRIVER || 'mysql').toLowerCase();

// Common envs
const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'rentivo';
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;
const socketPath = process.env.DB_SOCKET_PATH || process.env.DB_SOCKET || undefined;

// MySQL state
const baseOptions: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '10', 10),
    queueLimit: 0,
    multipleStatements: true
};

let pool: mysql.Pool | undefined;

// Mongo state
let mongoClient: MongoClient | undefined;
let mongoDb: Db | undefined;

function ensureMysqlPool() {
    if (pool) return pool;
    pool = mysql.createPool(
        socketPath
            ? { ...baseOptions, user: dbUser, password: dbPassword, database: dbName, socketPath }
            : { ...baseOptions, host: dbHost, user: dbUser, password: dbPassword, database: dbName, port: dbPort }
    );
    return pool;
}

export function getDbType() {
    return dbType as 'mysql' | 'mongodb';
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (dbType === 'mysql') {
        const p = ensureMysqlPool();
        const [rows] = await p.query(sql, params);
        return rows as T[];
    }
    // Intentionally throw for Mongo to avoid accidental SQL usage
    throw new Error('query(sql, params) is not supported for MongoDB. Use the Mongo helpers (collection, getMongoDb).');
}

export async function initDatabase(): Promise<void> {
    if (dbType === 'mysql') {
        let conn: mysql.PoolConnection | undefined;
        try {
            const p = ensureMysqlPool();
            conn = await p.getConnection();
            await conn.ping();
        } catch (err: any) {
            const triedSockets: string[] = [];
            if (!socketPath) {
                const commonSocketPaths = ['/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock', '/var/lib/mysql/mysql.sock'];
                for (const pth of commonSocketPaths) {
                    try {
                        if (!fs.existsSync(pth)) continue;
                        triedSockets.push(pth);
                        pool = mysql.createPool({ ...baseOptions, user: dbUser, password: dbPassword, database: dbName, socketPath: pth });
                        conn = await pool.getConnection();
                        await conn.ping();
                        return;
                    } catch (e) {
                        continue;
                    } finally {
                        if (conn) {
                            try { conn.release(); } catch (_) {}
                            conn = undefined;
                        }
                    }
                }
                if (triedSockets.length) {
                    (err as any).message = `${(err as any).message} (attempted sockets: ${triedSockets.join(', ')})`;
                }
            }
            const hintLines: string[] = [];
            if (err && err.code && String(err.code).startsWith('ER_ACCESS_DENIED')) {
                hintLines.push(
                    'Access denied: verify DB_USER/DB_PASSWORD and that the user has permissions on DB_NAME.',
                    "On many Linux setups, MySQL 'root' uses auth_socket and can't login with a blank password.",
                    'Either create a dedicated user, set a proper password, or use DB_SOCKET_PATH if using a local socket.'
                );
            }
            if (!process.env.DB_USER) hintLines.push('DB_USER is not set in your environment/.env; set it (e.g., DB_USER=rentivo)');
            if (!dbName) hintLines.push('DB_NAME is empty; set it in your .env (e.g., DB_NAME=rentivo).');
            if (!socketPath && !dbHost) hintLines.push('DB_HOST is empty; set DB_HOST or DB_SOCKET_PATH in your .env.');
            const help = hintLines.length ? `\nHints:\n- ${hintLines.join('\n- ')}` : '';
            const safeTarget = socketPath ? `socket ${socketPath}` : `${dbHost}${dbPort ? ':' + dbPort : ''}`;
            throw new Error(`Database ping failed for ${safeTarget} as '${dbUser}' on schema '${dbName}'. Original: ${err?.message || err}${help}`);
        } finally {
            if (conn) conn.release();
        }
        return;
    }

    // MongoDB init
    if (mongoDb) return;
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || `mongodb://${dbHost}:${dbPort || 27017}`;
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    mongoClient = client;
    mongoDb = client.db(dbName);
    // Simple ping
    await mongoDb.command({ ping: 1 });
}

export function getPool() {
    if (dbType !== 'mysql') throw new Error('getPool() only valid for MySQL');
    return ensureMysqlPool();
}

export function getMongoDb(): Db {
    if (dbType !== 'mongodb') throw new Error('getMongoDb() only valid for MongoDB');
    if (!mongoDb) throw new Error('MongoDB not initialized. Call initDatabase() first.');
    return mongoDb;
}

export function collection(name: string) {
    return getMongoDb().collection(name);
}

export async function closeDatabase(): Promise<void> {
    if (dbType === 'mysql') {
        if (pool) await pool.end();
        pool = undefined;
        return;
    }
    if (mongoClient) await mongoClient.close();
    mongoClient = undefined;
    mongoDb = undefined;
}

export default (dbType === 'mysql' ? ensureMysqlPool() : undefined) as any;
