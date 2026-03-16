import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { events } from '../../db/schema/index.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

const PAGE_SIZE = 50;

export async function eventRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get<{
		Querystring: { page?: string; type?: string; from?: string; to?: string };
	}>('/events', async (request, reply) => {
		const db = getDb();
		const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1);
		const typeFilter = request.query.type || null;
		const fromDate = request.query.from || null;
		const toDate = request.query.to || null;

		const conditions = [];
		if (typeFilter) {
			conditions.push(eq(events.type, typeFilter as typeof events.type.enumValues[number]));
		}
		if (fromDate) {
			conditions.push(gte(events.createdAt, new Date(fromDate)));
		}
		if (toDate) {
			conditions.push(lte(events.createdAt, new Date(`${toDate}T23:59:59`)));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [totalResult] = await db.select({ count: count() }).from(events).where(where);
		const total = totalResult?.count ?? 0;
		const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

		const items = await db
			.select({
				id: events.id,
				type: events.type,
				severity: events.severity,
				recipient: events.recipient,
				messageId: events.messageId,
				createdAt: events.createdAt,
			})
			.from(events)
			.where(where)
			.orderBy(desc(events.createdAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE);

		const flash = getFlash(request);
		return reply.view('events/list.ejs', {
			currentPath: '/events',
			flash,
			events: items,
			pagination: { page, totalPages, total },
			filters: { type: typeFilter, from: fromDate, to: toDate },
		});
	});
}
