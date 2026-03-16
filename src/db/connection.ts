import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
	if (!_pool) {
		_pool = new pg.Pool({
			connectionString: env().DATABASE_URL,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 5000,
		});
	}
	return _pool;
}

export function getDb() {
	return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;

export async function closeDb(): Promise<void> {
	if (_pool) {
		await _pool.end();
		_pool = null;
	}
}
