import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import { domains, suppressionList } from '../db/schema/index.js';
import { PERMISSIONS, authenticate, authorizeDomain, checkPermission } from '../middleware/auth.js';
import { suppressionCreateSchema } from '../middleware/validation.js';

export async function suppressionRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', authenticate);

	// List suppressions by type
	app.get<{
		Params: { domain: string; type: string };
	}>('/:domain/suppressions/:type', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.SUPPRESSIONS_READ)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const { domain: domainName, type } = request.params;

		const reasonMap: Record<string, string> = {
			bounces: 'bounce',
			unsubscribes: 'unsubscribe',
			complaints: 'complaint',
		};
		const reason = reasonMap[type];
		if (!reason) {
			return reply.code(400).send({ error: 'Type must be bounces, unsubscribes, or complaints' });
		}

		const [domain] = await db
			.select({ id: domains.id })
			.from(domains)
			.where(eq(domains.name, domainName))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		const items = await db
			.select()
			.from(suppressionList)
			.where(
				and(
					eq(suppressionList.domainId, domain.id),
					eq(suppressionList.reason, reason as 'bounce' | 'unsubscribe' | 'complaint'),
				),
			);

		reply.send({ items });
	});

	// Add suppression
	app.post<{
		Params: { domain: string; type: string };
		Body: { email: string; details?: string };
	}>('/:domain/suppressions/:type', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.SUPPRESSIONS_WRITE)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const { domain: domainName, type } = request.params;

		const reasonMap: Record<string, string> = {
			bounces: 'bounce',
			unsubscribes: 'unsubscribe',
			complaints: 'complaint',
		};
		const reason = reasonMap[type];
		if (!reason) {
			return reply.code(400).send({ error: 'Type must be bounces, unsubscribes, or complaints' });
		}

		const parsed = suppressionCreateSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
		}
		const { email, details } = parsed.data;

		const [domain] = await db
			.select({ id: domains.id })
			.from(domains)
			.where(eq(domains.name, domainName))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		await db
			.insert(suppressionList)
			.values({
				domainId: domain.id,
				email,
				reason: reason as 'bounce' | 'unsubscribe' | 'complaint',
				details,
			})
			.onDuplicateKeyUpdate({ set: { id: sql`id` } });

		reply.code(201).send({ message: 'Suppression added' });
	});

	// Delete suppression
	app.delete<{
		Params: { domain: string; type: string };
		Querystring: { email: string };
	}>('/:domain/suppressions/:type', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.SUPPRESSIONS_WRITE)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const { domain: domainName } = request.params;
		const { email } = request.query;

		if (!email) {
			return reply.code(400).send({ error: 'email query param is required' });
		}

		const [domain] = await db
			.select({ id: domains.id })
			.from(domains)
			.where(eq(domains.name, domainName))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		const [existing] = await db
			.select({ id: suppressionList.id })
			.from(suppressionList)
			.where(and(eq(suppressionList.domainId, domain.id), eq(suppressionList.email, email)));

		if (!existing) {
			return reply.code(404).send({ error: 'Suppression not found' });
		}

		await db
			.delete(suppressionList)
			.where(and(eq(suppressionList.domainId, domain.id), eq(suppressionList.email, email)));

		reply.code(204).send();
	});
}
