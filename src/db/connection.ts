import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
	if (!_pool) {
		_pool = mysql.createPool({
			uri: env().DATABASE_URL,
			waitForConnections: true,
			connectionLimit: 20,
			idleTimeout: 30000,
		});
	}
	return _pool;
}

export function getDb() {
	return drizzle(getPool(), { schema, mode: 'default' });
}

export type Db = ReturnType<typeof getDb>;

export async function closeDb(): Promise<void> {
	if (_pool) {
		await _pool.end();
		_pool = null;
	}
}
