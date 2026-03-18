import { count, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { events, domains, messages } from '../../db/schema/index.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/', async (request, reply) => {
		const db = getDb();

		const [domainCount] = await db.select({ count: count() }).from(domains);
		const [messageCount] = await db.select({ count: count() }).from(messages);

		const statusCounts = await db
			.select({
				status: messages.status,
				count: count(),
			})
			.from(messages)
			.groupBy(messages.status);

		const recentEvents = await db
			.select({
				id: events.id,
				type: events.type,
				severity: events.severity,
				recipient: events.recipient,
				createdAt: events.createdAt,
				messageId: events.messageId,
			})
			.from(events)
			.orderBy(desc(events.createdAt))
			.limit(20);

		const flash = getFlash(request);

		return reply.view('dashboard/index.ejs', {
			currentPath: '/',
			flash,
			stats: {
				domains: domainCount?.count ?? 0,
				messages: messageCount?.count ?? 0,
				statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
			},
			recentEvents,
		});
	});
}
