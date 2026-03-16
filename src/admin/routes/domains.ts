import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { domains, ipAddresses, ipPools } from '../../db/schema/index.js';
import { generateDkimKeyPair } from '../../services/dkim.js';
import { verifyDomainDns } from '../../services/dns-verifier.js';
import { enqueueMessage } from '../../services/email-sender.js';
import { writePostfixConfig } from '../../services/postfix-config.js';
import { getRequiredDnsRecords } from '../../utils/dns.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

export async function domainRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/domains', async (request, reply) => {
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
			.orderBy(desc(domains.createdAt));

		const flash = getFlash(request);
		return reply.view('domains/list.ejs', { currentPath: '/domains', flash, domains: allDomains });
	});

	app.get<{ Params: { id: string } }>('/domains/:id', async (request, reply) => {
		const db = getDb();
		const [domain] = await db
			.select({
				id: domains.id,
				name: domains.name,
				spfVerified: domains.spfVerified,
				dkimVerified: domains.dkimVerified,
				dmarcVerified: domains.dmarcVerified,
				dkimSelector: domains.dkimSelector,
				dkimPublicKey: domains.dkimPublicKey,
				ipPoolId: domains.ipPoolId,
				webhooks: domains.webhooks,
				createdAt: domains.createdAt,
				updatedAt: domains.updatedAt,
			})
			.from(domains)
			.where(eq(domains.id, request.params.id))
			.limit(1);

		if (!domain) {
			return reply.redirect('/admin/domains');
		}

		const pools = await db
			.select({ id: ipPools.id, name: ipPools.name, isDefault: ipPools.isDefault })
			.from(ipPools)
			.orderBy(ipPools.name);

		// Get IPs from assigned pool (or default pool) for SPF record
		const poolId = domain.ipPoolId;
		let assignedIps: string[] = [];
		if (poolId) {
			const ips = await db
				.select({ address: ipAddresses.address })
				.from(ipAddresses)
				.where(eq(ipAddresses.poolId, poolId));
			assignedIps = ips.map((ip) => ip.address);
		} else {
			// Check default pool
			const [defaultPool] = await db
				.select({ id: ipPools.id })
				.from(ipPools)
				.where(eq(ipPools.isDefault, true))
				.limit(1);
			if (defaultPool) {
				const ips = await db
					.select({ address: ipAddresses.address })
					.from(ipAddresses)
					.where(eq(ipAddresses.poolId, defaultPool.id));
				assignedIps = ips.map((ip) => ip.address);
			}
		}

		const dnsRecords = getRequiredDnsRecords(domain.name, domain.dkimSelector, domain.dkimPublicKey, assignedIps);
		const flash = getFlash(request);

		return reply.view('domains/detail.ejs', {
			currentPath: '/domains',
			flash,
			domain,
			dnsRecords,
			pools,
		});
	});

	app.post<{ Body: { name: string } }>('/domains', async (request, reply) => {
		const { name } = request.body;

		if (!name) {
			request.session.set('flash', { type: 'error', message: 'Domain name is required' });
			return reply.redirect('/admin/domains');
		}

		const db = getDb();
		const { privateKey, publicKey } = generateDkimKeyPair();

		try {
			await db.insert(domains).values({
				name: name.toLowerCase().trim(),
				dkimPrivateKey: privateKey,
				dkimPublicKey: publicKey,
			});
			request.session.set('flash', { type: 'success', message: `Domain ${name} created` });
		} catch (err: unknown) {
			const message = err instanceof Error && err.message.includes('unique') ? 'Domain already exists' : 'Failed to create domain';
			request.session.set('flash', { type: 'error', message });
		}

		return reply.redirect('/admin/domains');
	});

	app.post<{ Params: { id: string }; Body: { poolId: string } }>(
		'/domains/:id/pool',
		async (request, reply) => {
			const db = getDb();
			const poolId = request.body.poolId || null;

			await db
				.update(domains)
				.set({ ipPoolId: poolId, updatedAt: new Date() })
				.where(eq(domains.id, request.params.id));

			await writePostfixConfig(db);

			request.session.set('flash', {
				type: 'success',
				message: poolId ? 'IP pool assigned' : 'IP pool removed',
			});
			return reply.redirect(`/admin/domains/${request.params.id}`);
		},
	);

	app.post<{ Params: { id: string } }>('/domains/:id/verify', async (request, reply) => {
		const db = getDb();
		const [domain] = await db.select().from(domains).where(eq(domains.id, request.params.id)).limit(1);

		if (!domain) {
			return reply.redirect('/admin/domains');
		}

		const result = await verifyDomainDns(db, domain.id);
		const allVerified = result.spf && result.dkim && result.dmarc;
		const type = allVerified ? 'success' : 'info';
		const message = allVerified
			? 'All DNS records verified!'
			: `Verification: SPF ${result.spf ? 'OK' : 'FAIL'}, DKIM ${result.dkim ? 'OK' : 'FAIL'}, DMARC ${result.dmarc ? 'OK' : 'FAIL'}`;

		request.session.set('flash', { type, message });
		return reply.redirect(`/admin/domains/${domain.id}`);
	});

	app.post<{
		Params: { id: string };
		Body: { from: string; to: string; subject: string; text?: string; html?: string };
	}>('/domains/:id/send-test', async (request, reply) => {
		const db = getDb();
		const [domain] = await db
			.select({ name: domains.name })
			.from(domains)
			.where(eq(domains.id, request.params.id))
			.limit(1);

		if (!domain) {
			return reply.redirect('/admin/domains');
		}

		const { from, to, subject, text, html } = request.body;

		try {
			const result = await enqueueMessage(db, domain.name, {
				from,
				to,
				subject,
				text: text || undefined,
				html: html || undefined,
			});

			request.session.set('flash', {
				type: 'success',
				message: `Test email queued (ID: ${result.id.slice(0, 8)}...)`,
			});
		} catch (err) {
			const error = err as Error;
			request.session.set('flash', {
				type: 'error',
				message: `Failed to send: ${error.message}`,
			});
		}

		return reply.redirect(`/admin/domains/${request.params.id}`);
	});

	app.post<{ Params: { id: string } }>('/domains/:id/delete', async (request, reply) => {
		const db = getDb();
		await db.delete(domains).where(eq(domains.id, request.params.id));
		await writePostfixConfig(db);
		request.session.set('flash', { type: 'success', message: 'Domain deleted' });
		return reply.redirect('/admin/domains');
	});
}
