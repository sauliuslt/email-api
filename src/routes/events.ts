import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import { events, domains, messages } from '../db/schema/index.js';
import { PERMISSIONS, authenticate, authorizeDomain, checkPermission } from '../middleware/auth.js';

export async function eventRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', authenticate);

	app.get<{
		Params: { domain: string };
		Querystring: {
			type?: string;
			recipient?: string;
			begin?: string;
			end?: string;
			limit?: string;
			cursor?: string;
		};
	}>('/:domain/events', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.EVENTS_READ)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const { domain: domainName } = request.params;
		const { type, recipient, begin, end, limit: limitStr, cursor } = request.query;

		// Find domain
		const [domain] = await db
			.select({ id: domains.id })
			.from(domains)
			.where(eq(domains.name, domainName))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		const pageSize = Math.min(Number(limitStr) || 100, 300);
		const conditions = [eq(messages.domainId, domain.id)];

		if (type) {
			conditions.push(eq(events.type, type as (typeof events.type.enumValues)[number]));
		}
		if (recipient) {
			conditions.push(eq(events.recipient, recipient));
		}
		if (begin) {
			conditions.push(gte(events.createdAt, new Date(begin)));
		}
		if (end) {
			conditions.push(lte(events.createdAt, new Date(end)));
		}
		if (cursor) {
			conditions.push(lte(events.createdAt, new Date(cursor)));
		}

		const rows = await db
			.select({
				id: events.id,
				messageId: events.messageId,
				type: events.type,
				severity: events.severity,
				recipient: events.recipient,
				details: events.details,
				createdAt: events.createdAt,
			})
			.from(events)
			.innerJoin(messages, eq(events.messageId, messages.id))
			.where(and(...conditions))
			.orderBy(desc(events.createdAt))
			.limit(pageSize + 1);

		const hasMore = rows.length > pageSize;
		const items = hasMore ? rows.slice(0, pageSize) : rows;
		const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : undefined;

		reply.send({ items, paging: { next: nextCursor } });
	});
}
