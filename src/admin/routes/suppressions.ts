import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { domains, suppressionList } from '../../db/schema/index.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

const PAGE_SIZE = 50;

export async function suppressionRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get<{
		Querystring: { page?: string; reason?: string; domain?: string };
	}>('/suppressions', async (request, reply) => {
		const db = getDb();
		const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1);
		const reasonFilter = request.query.reason || null;
		const domainFilter = request.query.domain || null;

		const conditions = [];
		if (reasonFilter) {
			conditions.push(eq(suppressionList.reason, reasonFilter as 'bounce' | 'unsubscribe' | 'complaint'));
		}
		if (domainFilter) {
			conditions.push(eq(suppressionList.domainId, domainFilter));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [totalResult] = await db.select({ count: count() }).from(suppressionList).where(where);
		const total = totalResult?.count ?? 0;
		const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

		const items = await db
			.select({
				id: suppressionList.id,
				email: suppressionList.email,
				reason: suppressionList.reason,
				details: suppressionList.details,
				domainId: suppressionList.domainId,
				createdAt: suppressionList.createdAt,
			})
			.from(suppressionList)
			.where(where)
			.orderBy(desc(suppressionList.createdAt))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE);

		const allDomains = await db
			.select({ id: domains.id, name: domains.name })
			.from(domains)
			.orderBy(domains.name);

		const flash = getFlash(request);
		return reply.view('suppressions/list.ejs', {
			currentPath: '/suppressions',
			flash,
			suppressions: items,
			domains: allDomains,
			pagination: { page, totalPages, total },
			filters: { reason: reasonFilter, domain: domainFilter },
		});
	});

	app.post<{ Body: { email: string; domainId: string; reason: string; details?: string } }>(
		'/suppressions',
		async (request, reply) => {
			const { email, domainId, reason, details } = request.body;

			if (!email || !domainId || !reason) {
				request.session.set('flash', { type: 'error', message: 'Email, domain, and reason are required' });
				return reply.redirect('/admin/suppressions');
			}

			const db = getDb();
			try {
				await db.insert(suppressionList).values({
					email: email.toLowerCase().trim(),
					domainId,
					reason: reason as 'bounce' | 'unsubscribe' | 'complaint',
					details: details || null,
				}).onDuplicateKeyUpdate({ set: { id: sql`id` } });

				request.session.set('flash', { type: 'success', message: `Suppression added for ${email}` });
			} catch {
				request.session.set('flash', { type: 'error', message: 'Failed to add suppression' });
			}

			return reply.redirect('/admin/suppressions');
		},
	);

	app.post<{ Params: { id: string } }>('/suppressions/:id/delete', async (request, reply) => {
		const db = getDb();
		await db.delete(suppressionList).where(eq(suppressionList.id, request.params.id));
		request.session.set('flash', { type: 'success', message: 'Suppression removed' });
		return reply.redirect('/admin/suppressions');
	});
}
