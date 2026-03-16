import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { getPool } from '../db/connection.js';
import { getSendQueue } from '../queues/send-queue.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
	app.get('/health', async (_request, reply) => {
		const checks: Record<string, string> = {};

		try {
			await getPool().query('SELECT 1');
			checks.database = 'ok';
		} catch {
			checks.database = 'error';
		}

		try {
			const client = await getSendQueue().client;
			const pong = await client.ping();
			checks.redis = pong === 'PONG' ? 'ok' : 'error';
		} catch {
			checks.redis = 'error';
		}

		const healthy = Object.values(checks).every((v) => v === 'ok');

		if (env().NODE_ENV === 'production') {
			reply.code(healthy ? 200 : 503).send({ status: healthy ? 'healthy' : 'degraded' });
		} else {
			reply.code(healthy ? 200 : 503).send({
				status: healthy ? 'healthy' : 'degraded',
				checks,
			});
		}
	});
}
