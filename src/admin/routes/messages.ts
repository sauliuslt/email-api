import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { domains, events, messages } from '../../db/schema/index.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

const PAGE_SIZE = 50;

export async function messageRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get<{
		Querystring: { page?: string; status?: string; domain?: string };
	}>('/messages', async (request, reply) => {
		const db = getDb();
		const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1);
		const statusFilter = request.query.status || null;
		const domainFilter = request.query.domain || null;

		const conditions = [];
		if (statusFilter) {
			conditions.push(eq(messages.status, statusFilter as typeof messages.status.enumValues[number]));
		}
		if (domainFilter) {
			conditions.push(eq(messages.domainId, domainFilter));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [totalResult] = await db.select({ count: count() }).from(messages).where(where);
		const total = totalResult?.count ?? 0;
		const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

		const items = await db
			.select({
				id: messages.id,
				from: messages.from,
				to: messages.to,
				subject: messages.subject,
				status: messages.status,
				domainId: messages.domainId,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.where(where)
			.orderBy(desc(messages.createdAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE);

		const allDomains = await db
			.select({ id: domains.id, name: domains.name })
			.from(domains)
			.orderBy(domains.name);

		const flash = getFlash(request);
		return reply.view('messages/list.ejs', {
			currentPath: '/messages',
			flash,
			messages: items,
			domains: allDomains,
			pagination: { page, totalPages, total },
			filters: { status: statusFilter, domain: domainFilter },
		});
	});

	app.get<{ Params: { id: string } }>('/messages/:id', async (request, reply) => {
		const db = getDb();
		const [message] = await db.select().from(messages).where(eq(messages.id, request.params.id)).limit(1);

		if (!message) {
			return reply.redirect('/admin/messages');
		}

		const messageEvents = await db
			.select()
			.from(events)
			.where(eq(events.messageId, message.id))
			.orderBy(desc(events.createdAt));

		const [domain] = await db
			.select({ name: domains.name })
			.from(domains)
			.where(eq(domains.id, message.domainId))
			.limit(1);

		const flash = getFlash(request);
		return reply.view('messages/detail.ejs', {
			currentPath: '/messages',
			flash,
			message,
			events: messageEvents,
			domainName: domain?.name ?? 'Unknown',
		});
	});

}
