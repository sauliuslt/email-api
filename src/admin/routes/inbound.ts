import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { inboundEmails, messages } from '../../db/schema/index.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

const PAGE_SIZE = 50;

export async function inboundRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get<{
		Querystring: { page?: string; classification?: string };
	}>('/inbound', async (request, reply) => {
		const db = getDb();
		const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1);
		const classificationFilter = request.query.classification || null;

		const conditions = [];
		if (classificationFilter) {
			conditions.push(
				eq(
					inboundEmails.classification,
					classificationFilter as 'bounce' | 'complaint' | 'unsubscribe' | 'unknown',
				),
			);
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [totalResult] = await db.select({ count: count() }).from(inboundEmails).where(where);
		const total = totalResult?.count ?? 0;
		const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

		const items = await db
			.select({
				id: inboundEmails.id,
				sender: inboundEmails.sender,
				recipient: inboundEmails.recipient,
				subject: inboundEmails.subject,
				classification: inboundEmails.classification,
				matched: inboundEmails.matched,
				messageId: inboundEmails.messageId,
				createdAt: inboundEmails.createdAt,
			})
			.from(inboundEmails)
			.where(where)
			.orderBy(desc(inboundEmails.createdAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE);

		const flash = getFlash(request);
		return reply.view('inbound/list.ejs', {
			currentPath: '/inbound',
			flash,
			emails: items,
			pagination: { page, totalPages, total },
			filters: { classification: classificationFilter },
		});
	});

	app.get<{ Params: { id: string } }>('/inbound/:id', async (request, reply) => {
		const db = getDb();
		const [email] = await db
			.select()
			.from(inboundEmails)
			.where(eq(inboundEmails.id, request.params.id))
			.limit(1);

		if (!email) {
			return reply.redirect('/admin/inbound');
		}

		// Get matched message details if available
		let matchedMessage = null;
		if (email.messageId) {
			const [msg] = await db
				.select({
					id: messages.id,
					from: messages.from,
					to: messages.to,
					subject: messages.subject,
					status: messages.status,
				})
				.from(messages)
				.where(eq(messages.id, email.messageId))
				.limit(1);
			matchedMessage = msg ?? null;
		}

		const flash = getFlash(request);
		return reply.view('inbound/detail.ejs', {
			currentPath: '/inbound',
			flash,
			email,
			matchedMessage,
		});
	});
}
