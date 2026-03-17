import 'dotenv/config';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { closeDb, getDb } from './db/connection.js';
import { getSendQueue } from './queues/send-queue.js';
import { writePostfixConfig } from './services/postfix-config.js';

const config = loadEnv();

await migrate(getDb(), { migrationsFolder: './src/db/migrations' });

// Sync Postfix config with current DB state
await writePostfixConfig(getDb()).catch(() => {});

const app = await buildApp();

await app.listen({ port: config.PORT, host: config.HOST });

async function shutdown() {
	app.log.info('Shutting down...');
	await app.close();
	await getSendQueue().close();
	await closeDb();
	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
