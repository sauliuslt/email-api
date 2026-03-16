import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { domains, messages } from '../db/schema/index.js';
import { PERMISSIONS, authenticate, authorizeDomain, checkPermission } from '../middleware/auth.js';
import { sendMessageSchema } from '../middleware/validation.js';
import { enqueueMessage } from '../services/email-sender.js';
import type { SendMessagePayload } from '../types/index.js';

export async function messageRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', authenticate);

	// Send message
	app.post<{
		Params: { domain: string };
		Body: SendMessagePayload;
	}>(
		'/:domain/messages',
		{
			config: {
				rateLimit: {
					max: env().RATE_LIMIT_SEND_MAX,
					timeWindow: '1 minute',
				},
			},
		},
		async (request, reply) => {
			if (!checkPermission(request, reply, PERMISSIONS.MESSAGES_SEND)) return;
			await authorizeDomain(request, reply);
			if (reply.sent) return;

			const { domain } = request.params;

			const result = sendMessageSchema.safeParse(request.body);
			if (!result.success) {
				return reply
					.code(400)
					.send({ error: result.error.issues[0]?.message ?? 'Validation failed' });
			}
			const { from, to, subject, text, html } = result.data;

			if (!text && !html) {
				return reply.code(400).send({ error: 'Either text or html body is required' });
			}

			// Verify from address domain matches route domain
			const fromDomain = from.split('@')[1];
			if (!fromDomain || fromDomain.toLowerCase() !== domain.toLowerCase()) {
				return reply.code(400).send({ error: 'From address domain must match the route domain' });
			}

			const db = getDb();
			const msg = await enqueueMessage(db, domain, { from, to, subject, text, html });

			reply.code(202).send({
				message: 'Queued. Thank you.',
				id: msg.id,
			});
		},
	);

	// Get message status
	app.get<{ Params: { domain: string; id: string } }>(
		'/:domain/messages/:id',
		async (request, reply) => {
			if (!checkPermission(request, reply, PERMISSIONS.MESSAGES_READ)) return;
			await authorizeDomain(request, reply);
			if (reply.sent) return;

			const db = getDb();
			const [domain] = await db
				.select({ id: domains.id })
				.from(domains)
				.where(eq(domains.name, request.params.domain))
				.limit(1);

			if (!domain) {
				return reply.code(404).send({ error: 'Domain not found' });
			}

			const [message] = await db
				.select({
					id: messages.id,
					from: messages.from,
					to: messages.to,
					subject: messages.subject,
					status: messages.status,
					messageIdHeader: messages.messageIdHeader,
					createdAt: messages.createdAt,
					updatedAt: messages.updatedAt,
				})
				.from(messages)
				.where(and(eq(messages.id, request.params.id), eq(messages.domainId, domain.id)))
				.limit(1);

			if (!message) {
				return reply.code(404).send({ error: 'Message not found' });
			}

			reply.send(message);
		},
	);
}
