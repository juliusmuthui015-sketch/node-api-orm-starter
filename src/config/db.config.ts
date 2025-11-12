import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded if this module is imported directly (safety for various import orders)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
// default DB name to 'rentivo' to avoid confusing empty-schema errors during local dev
const dbName = process.env.DB_NAME || 'rentivo';
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;
const socketPath = process.env.DB_SOCKET_PATH || process.env.DB_SOCKET || undefined;

const baseOptions: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '10', 10),
    queueLimit: 0
};

let pool = mysql.createPool(
    socketPath
        ? { ...baseOptions, user: dbUser, password: dbPassword, database: dbName, socketPath }
        : { ...baseOptions, host: dbHost, user: dbUser, password: dbPassword, database: dbName, port: dbPort }
);

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
}

export async function initDatabase(): Promise<void> {
    let conn: mysql.PoolConnection | undefined;
    try {
        conn = await pool.getConnection();
        await conn.ping();
    } catch (err: any) {
        // If initial connection failed, try common local socket paths as a fallback
        const triedSockets: string[] = [];
        if (!socketPath) {
            const commonSocketPaths = ['/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock', '/var/lib/mysql/mysql.sock'];
            for (const p of commonSocketPaths) {
                try {
                    if (!fs.existsSync(p)) continue;
                    triedSockets.push(p);
                    // replace pool to use the socket and retry
                    pool = mysql.createPool({ ...baseOptions, user: dbUser, password: dbPassword, database: dbName, socketPath: p });
                    conn = await pool.getConnection();
                    await conn.ping();
                    // success — return early
                    return;
                } catch (e) {
                    // ignore and try next socket
                    continue;
                } finally {
                    if (conn) {
                        try { conn.release(); } catch (_) {}
                        conn = undefined;
                    }
                }
            }
            if (triedSockets.length) {
                // leftover: none of the sockets worked; add hint
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
        // If DB_USER wasn't explicitly provided in the environment, provide a clear hint
        if (!process.env.DB_USER) {
            hintLines.push("DB_USER is not set in your environment/.env; set it (e.g., DB_USER=rentivo)");
        }
        if (!dbName) {
            hintLines.push('DB_NAME is empty; set it in your .env (e.g., DB_NAME=rentivo).');
        }
        if (!socketPath && !dbHost) {
            hintLines.push('DB_HOST is empty; set DB_HOST or DB_SOCKET_PATH in your .env.');
        }
        const help = hintLines.length ? `\nHints:\n- ${hintLines.join('\n- ')}` : '';
        const safeTarget = socketPath ? `socket ${socketPath}` : `${dbHost}${dbPort ? ':' + dbPort : ''}`;
        throw new Error(`Database ping failed for ${safeTarget} as '${dbUser}' on schema '${dbName}'. Original: ${err?.message || err}${help}`);
    } finally {
        if (conn) conn.release();
    }
}

export function getPool() {
    return pool;
}

export default pool;
