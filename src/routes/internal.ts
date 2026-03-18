import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { events, messages } from '../db/schema/index.js';
import { addSuppression, processInboundEmail } from '../services/inbound-processor.js';

interface DeliveryStatusBody {
	queueId: string;
	status: 'sent' | 'bounced' | 'deferred';
	recipient: string;
	relay?: string;
	dsn?: string;
	response?: string;
}

interface InboundBody {
	sender: string;
	recipient: string;
	rawEmail: string;
}

export async function internalRoutes(app: FastifyInstance) {
	// Authenticate all internal routes via shared secret
	app.addHook('onRequest', async (request, reply) => {
		const secret = request.headers['x-internal-secret'] as string | undefined;
		if (!secret) {
			return reply.code(401).send({ error: 'Missing internal secret' });
		}
		const secretBuf = Buffer.from(secret);
		const expectedBuf = Buffer.from(env().INTERNAL_API_SECRET);
		if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
			return reply.code(401).send({ error: 'Invalid internal secret' });
		}
	});

	// Called by the Postfix log watcher to update delivery status
	app.post<{ Body: DeliveryStatusBody }>('/delivery-status', async (request, reply) => {
		const db = getDb();
		const { queueId, status, recipient, relay, dsn, response } = request.body;

		if (!queueId || !status) {
			return reply.status(400).send({ error: 'queueId and status required' });
		}

		// Find message by Postfix queue ID
		const [message] = await db
			.select({
				id: messages.id,
				status: messages.status,
				domainId: messages.domainId,
				to: messages.to,
			})
			.from(messages)
			.where(eq(messages.postfixQueueId, queueId))
			.limit(1);

		if (!message) {
			return reply.status(404).send({ error: 'Message not found for queue ID' });
		}

		// Map Postfix status to our status
		let newStatus: 'delivered' | 'bounced' | 'failed';
		let eventType: 'delivered' | 'bounced' | 'failed';
		let severity: 'info' | 'error' | 'warning';

		if (status === 'sent') {
			newStatus = 'delivered';
			eventType = 'delivered';
			severity = 'info';
		} else if (status === 'bounced') {
			newStatus = 'bounced';
			eventType = 'bounced';
			severity = 'error';
		} else {
			// deferred - don't change status yet, just log the event
			await db.insert(events).values({
				messageId: message.id,
				type: 'failed',
				severity: 'warning',
				recipient,
				details: { relay, dsn, response, note: 'Delivery deferred, will retry' },
			});
			return reply.send({ ok: true, status: 'deferred' });
		}

		// Only update if message is still in a pending state
		if (message.status === 'sending' || message.status === 'queued') {
			await db
				.update(messages)
				.set({ status: newStatus, smtpResponse: response ?? null, updatedAt: new Date() })
				.where(eq(messages.id, message.id));
		}

		await db.insert(events).values({
			messageId: message.id,
			type: eventType,
			severity,
			recipient,
			details: { relay, dsn, response },
		});

		// Auto-suppress recipient on bounce
		if (status === 'bounced') {
			await addSuppression(
				db,
				message.domainId,
				message.to,
				'bounce',
				`Auto-suppressed: bounce detected via log watcher (dsn=${dsn ?? 'unknown'})`,
			);
		}

		return reply.send({ ok: true, status: newStatus });
	});

	// Called by Postfix inbound-handler.sh to process incoming emails
	app.post<{ Body: InboundBody }>(
		'/inbound',
		{
			config: {},
			bodyLimit: 35 * 1024 * 1024, // 35MB for large emails
		},
		async (request, reply) => {
			const { sender, recipient, rawEmail } = request.body;

			if (!sender || !recipient || !rawEmail) {
				return reply.status(400).send({ error: 'sender, recipient, and rawEmail required' });
			}

			const db = getDb();
			const result = await processInboundEmail(db, { sender, recipient, rawEmail });

			return reply.send({ ok: true, ...result });
		},
	);
}
