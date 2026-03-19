import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { apiKeys, domains } from '../../db/schema/index.js';
import { PERMISSIONS } from '../../middleware/auth.js';
import { generateApiKey } from '../../utils/crypto.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

const allPermissions = Object.values(PERMISSIONS);

export async function apiKeyRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/api-keys', async (request, reply) => {
		const db = getDb();
		const keys = await db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				keyPrefix: apiKeys.keyPrefix,
				domainId: apiKeys.domainId,
				permissions: apiKeys.permissions,
				active: apiKeys.active,
				createdAt: apiKeys.createdAt,
			})
			.from(apiKeys)
			.orderBy(desc(apiKeys.createdAt));

		const allDomains = await db
			.select({ id: domains.id, name: domains.name })
			.from(domains)
			.orderBy(domains.name);

		const flash = getFlash(request);
		const newKey = request.session.get('newKey') ?? null;
		if (newKey) {
			request.session.set('newKey', undefined);
		}

		return reply.view('api-keys/list.ejs', {
			currentPath: '/api-keys',
			flash,
			keys,
			domains: allDomains,
			newKey: newKey ?? null,
			allPermissions,
		});
	});

	app.post<{ Body: { name: string; domainId?: string; permissions?: string | string[] } }>('/api-keys', async (request, reply) => {
		const { name, domainId } = request.body;

		if (!name) {
			request.session.set('flash', { type: 'error', message: 'Name is required' });
			return reply.redirect('/admin/api-keys');
		}

		// Parse permissions from form (checkboxes submit string if one, array if multiple)
		const rawPerms = request.body.permissions;
		const perms = rawPerms
			? (Array.isArray(rawPerms) ? rawPerms : [rawPerms]).filter((p) => allPermissions.includes(p as any))
			: [];

		const { key, prefix, hash } = generateApiKey();
		const db = getDb();

		await db.insert(apiKeys).values({
			name,
			keyPrefix: prefix,
			keyHash: hash,
			domainId: domainId || null,
			permissions: perms,
		});

		request.session.set('flash', {
			type: 'success',
			message: "API key created. Copy it now — it won't be shown again.",
		});
		request.session.set('newKey', key);
		return reply.redirect('/admin/api-keys');
	});

	app.post<{ Params: { id: string } }>('/api-keys/:id/toggle', async (request, reply) => {
		const db = getDb();
		const [existing] = await db
			.select({ active: apiKeys.active })
			.from(apiKeys)
			.where(eq(apiKeys.id, request.params.id))
			.limit(1);

		if (!existing) {
			request.session.set('flash', { type: 'error', message: 'API key not found' });
			return reply.redirect('/admin/api-keys');
		}

		await db
			.update(apiKeys)
			.set({ active: !existing.active, updatedAt: new Date() })
			.where(eq(apiKeys.id, request.params.id));

		request.session.set('flash', {
			type: 'success',
			message: `API key ${existing.active ? 'deactivated' : 'activated'}`,
		});
		return reply.redirect('/admin/api-keys');
	});

	app.post<{ Params: { id: string } }>('/api-keys/:id/revoke', async (request, reply) => {
		const db = getDb();
		await db.delete(apiKeys).where(eq(apiKeys.id, request.params.id));
		request.session.set('flash', { type: 'success', message: 'API key revoked' });
		return reply.redirect('/admin/api-keys');
	});
}
