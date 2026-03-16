import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import { apiKeys } from '../db/schema/index.js';
import {
	PERMISSIONS,
	authenticate,
	checkPermission,
	requireMasterKey,
} from '../middleware/auth.js';
import { apiKeyCreateSchema } from '../middleware/validation.js';
import { generateApiKey } from '../utils/crypto.js';

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', authenticate);

	// Create API key
	app.post<{
		Body: { name: string; domainId?: string; permissions?: string[] };
	}>('/keys', async (request, reply) => {
		await requireMasterKey(request, reply);
		if (reply.sent) return;
		if (!checkPermission(request, reply, PERMISSIONS.KEYS_MANAGE)) return;

		const parsed = apiKeyCreateSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });
		}
		const { name, domainId, permissions } = parsed.data;

		const { key, prefix, hash } = generateApiKey();
		const db = getDb();

		const [created] = await db
			.insert(apiKeys)
			.values({
				name,
				keyPrefix: prefix,
				keyHash: hash,
				domainId: domainId ?? null,
				permissions: permissions ?? [],
			})
			.returning();

		reply.code(201).send({
			id: created!.id,
			key, // Only returned once
			keyPrefix: prefix,
			name: created!.name,
			domainId: created!.domainId,
			permissions: created!.permissions,
			active: created!.active,
			createdAt: created!.createdAt,
		});
	});

	// List API keys
	app.get('/keys', async (request, reply) => {
		await requireMasterKey(request, reply);
		if (reply.sent) return;
		if (!checkPermission(request, reply, PERMISSIONS.KEYS_MANAGE)) return;

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
			.from(apiKeys);

		reply.send({ items: keys });
	});

	// Update API key
	app.patch<{
		Params: { id: string };
		Body: { name?: string; permissions?: string[]; active?: boolean };
	}>('/keys/:id', async (request, reply) => {
		await requireMasterKey(request, reply);
		if (reply.sent) return;
		if (!checkPermission(request, reply, PERMISSIONS.KEYS_MANAGE)) return;

		const { id } = request.params;
		const { name, permissions, active } = request.body;
		const db = getDb();

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (name !== undefined) updates.name = name;
		if (permissions !== undefined) updates.permissions = permissions;
		if (active !== undefined) updates.active = active;

		const [updated] = await db.update(apiKeys).set(updates).where(eq(apiKeys.id, id)).returning({
			id: apiKeys.id,
			name: apiKeys.name,
			keyPrefix: apiKeys.keyPrefix,
			domainId: apiKeys.domainId,
			permissions: apiKeys.permissions,
			active: apiKeys.active,
			updatedAt: apiKeys.updatedAt,
		});

		if (!updated) {
			return reply.code(404).send({ error: 'API key not found' });
		}

		reply.send(updated);
	});

	// Delete API key
	app.delete<{ Params: { id: string } }>('/keys/:id', async (request, reply) => {
		await requireMasterKey(request, reply);
		if (reply.sent) return;
		if (!checkPermission(request, reply, PERMISSIONS.KEYS_MANAGE)) return;

		const { id } = request.params;
		const db = getDb();

		const [deleted] = await db
			.delete(apiKeys)
			.where(eq(apiKeys.id, id))
			.returning({ id: apiKeys.id });

		if (!deleted) {
			return reply.code(404).send({ error: 'API key not found' });
		}

		reply.code(204).send();
	});
}
