import 'dotenv/config';
import { loadEnv } from '../config/env.js';
import { createSendWorker } from './send-worker.js';

loadEnv();

console.log('Starting workers...');

const sendWorker = createSendWorker();

console.log('Send worker started.');

async function shutdown() {
	console.log('Shutting down workers...');
	await sendWorker.close();
	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
