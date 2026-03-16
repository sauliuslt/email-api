import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { apiKeys, domains } from '../db/schema/index.js';
import { hashApiKey } from '../utils/crypto.js';

declare module 'fastify' {
	interface FastifyRequest {
		apiKey?: {
			id: string;
			name: string;
			domainId: string | null;
			permissions: string[];
		};
	}
}

export const PERMISSIONS = {
	DOMAINS_READ: 'domains:read',
	DOMAINS_WRITE: 'domains:write',
	MESSAGES_SEND: 'messages:send',
	MESSAGES_READ: 'messages:read',
	EVENTS_READ: 'events:read',
	KEYS_MANAGE: 'keys:manage',
	SUPPRESSIONS_READ: 'suppressions:read',
	SUPPRESSIONS_WRITE: 'suppressions:write',
} as const;

function extractKey(request: FastifyRequest): string | null {
	const authHeader = request.headers.authorization;
	if (!authHeader) return null;

	// Bearer token
	if (authHeader.startsWith('Bearer ')) {
		return authHeader.slice(7);
	}

	// HTTP Basic: api:<key>
	if (authHeader.startsWith('Basic ')) {
		const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
		const [user, key] = decoded.split(':');
		if (user === 'api' && key) return key;
	}

	return null;
}

function isMasterKey(key: string): boolean {
	const keyBuf = Buffer.from(key);
	const masterBuf = Buffer.from(env().MASTER_API_KEY);
	return keyBuf.length === masterBuf.length && timingSafeEqual(keyBuf, masterBuf);
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
	const key = extractKey(request);
	if (!key) {
		reply.code(401).send({ error: 'Missing or invalid API key' });
		return;
	}

	// Timing-safe master API key comparison
	if (isMasterKey(key)) {
		request.apiKey = {
			id: 'master',
			name: 'Master Key',
			domainId: null,
			permissions: ['*'],
		};
		return;
	}

	const hash = hashApiKey(key);
	const db = getDb();
	const [found] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);

	if (!found || !found.active) {
		reply.code(401).send({ error: 'Invalid or inactive API key' });
		return;
	}

	request.apiKey = {
		id: found.id,
		name: found.name,
		domainId: found.domainId,
		permissions: (found.permissions as string[]) ?? [],
	};
}

export async function authorizeDomain(request: FastifyRequest, reply: FastifyReply): Promise<void> {
	const apiKey = request.apiKey;
	if (!apiKey) {
		reply.code(401).send({ error: 'Not authenticated' });
		return;
	}

	// Master key or unscoped key — allow all domains
	if (apiKey.domainId === null) return;

	const domainName = (request.params as Record<string, string>).domain;
	if (!domainName) return;

	const db = getDb();
	const [domain] = await db
		.select({ id: domains.id })
		.from(domains)
		.where(eq(domains.name, domainName))
		.limit(1);

	if (!domain) {
		reply.code(404).send({ error: 'Domain not found' });
		return;
	}

	if (domain.id !== apiKey.domainId) {
		reply.code(403).send({ error: 'Access denied to this domain' });
		return;
	}
}

export function checkPermission(
	request: FastifyRequest,
	reply: FastifyReply,
	permission: string,
): boolean {
	const apiKey = request.apiKey;
	if (!apiKey) {
		reply.code(401).send({ error: 'Not authenticated' });
		return false;
	}

	if (apiKey.permissions.includes('*') || apiKey.permissions.includes(permission)) {
		return true;
	}

	reply.code(403).send({ error: `Missing permission: ${permission}` });
	return false;
}

export async function requireMasterKey(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> {
	if (!request.apiKey || request.apiKey.id !== 'master') {
		reply.code(403).send({ error: 'Master API key required' });
	}
}
