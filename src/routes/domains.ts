import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/connection.js';
import { domains } from '../db/schema/index.js';
import { PERMISSIONS, authenticate, authorizeDomain, checkPermission } from '../middleware/auth.js';
import { domainNameSchema } from '../middleware/validation.js';
import { generateDkimKeyPair } from '../services/dkim.js';
import { verifyDomainDns } from '../services/dns-verifier.js';
import { getRequiredDnsRecords } from '../utils/dns.js';

export async function domainRoutes(app: FastifyInstance): Promise<void> {
	app.addHook('onRequest', authenticate);

	// Add domain
	app.post<{ Body: { name: string } }>('/domains', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_WRITE)) return;

		const parsed = domainNameSchema.safeParse(request.body.name);
		if (!parsed.success) {
			return reply
				.code(400)
				.send({ error: parsed.error.issues[0]?.message ?? 'Invalid domain name' });
		}
		const name = parsed.data;

		const db = getDb();
		const { privateKey, publicKey } = generateDkimKeyPair();

		const [domain] = await db
			.insert(domains)
			.values({
				name,
				dkimPrivateKey: privateKey,
				dkimPublicKey: publicKey,
			})
			.returning();

		const dnsRecords = getRequiredDnsRecords(name, domain!.dkimSelector, publicKey);

		reply.code(201).send({
			domain: {
				id: domain!.id,
				name: domain!.name,
				spfVerified: domain!.spfVerified,
				dkimVerified: domain!.dkimVerified,
				dmarcVerified: domain!.dmarcVerified,
				createdAt: domain!.createdAt,
			},
			dnsRecords,
		});
	});

	// List domains
	app.get('/domains', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_READ)) return;

		const db = getDb();
		const allDomains = await db
			.select({
				id: domains.id,
				name: domains.name,
				spfVerified: domains.spfVerified,
				dkimVerified: domains.dkimVerified,
				dmarcVerified: domains.dmarcVerified,
				createdAt: domains.createdAt,
			})
			.from(domains)
			.where(request.apiKey?.domainId ? eq(domains.id, request.apiKey.domainId) : undefined);

		reply.send({ items: allDomains });
	});

	// Get domain details
	app.get<{ Params: { domain: string } }>('/domains/:domain', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_READ)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const [domain] = await db
			.select({
				id: domains.id,
				name: domains.name,
				spfVerified: domains.spfVerified,
				dkimVerified: domains.dkimVerified,
				dmarcVerified: domains.dmarcVerified,
				ipPoolId: domains.ipPoolId,
				webhooks: domains.webhooks,
				createdAt: domains.createdAt,
				updatedAt: domains.updatedAt,
			})
			.from(domains)
			.where(eq(domains.name, request.params.domain))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		reply.send(domain);
	});

	// Get DNS records
	app.get<{ Params: { domain: string } }>('/domains/:domain/dns', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_READ)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const [domain] = await db
			.select()
			.from(domains)
			.where(eq(domains.name, request.params.domain))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		const dnsRecords = getRequiredDnsRecords(
			domain.name,
			domain.dkimSelector,
			domain.dkimPublicKey,
		);

		reply.send({ dnsRecords });
	});

	// Verify DNS
	app.put<{ Params: { domain: string } }>('/domains/:domain/verify', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_WRITE)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const [domain] = await db
			.select()
			.from(domains)
			.where(eq(domains.name, request.params.domain))
			.limit(1);

		if (!domain) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		const result = await verifyDomainDns(db, domain.id);

		reply.send({
			domain: domain.name,
			verification: result,
		});
	});

	// Delete domain
	app.delete<{ Params: { domain: string } }>('/domains/:domain', async (request, reply) => {
		if (!checkPermission(request, reply, PERMISSIONS.DOMAINS_WRITE)) return;
		await authorizeDomain(request, reply);
		if (reply.sent) return;

		const db = getDb();
		const [deleted] = await db
			.delete(domains)
			.where(eq(domains.name, request.params.domain))
			.returning({ id: domains.id });

		if (!deleted) {
			return reply.code(404).send({ error: 'Domain not found' });
		}

		reply.code(204).send();
	});
}
