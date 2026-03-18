import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { ipAddresses, ipPools } from '../../db/schema/index.js';
import { checkAllDnsbl } from '../../services/dnsbl.js';
import { writePostfixConfig } from '../../services/postfix-config.js';
import { reverseDnsLookup } from '../../services/reverse-dns.js';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

export async function ipPoolRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/ip-pools', async (request, reply) => {
		const db = getDb();
		const pools = await db
			.select({
				id: ipPools.id,
				name: ipPools.name,
				isDefault: ipPools.isDefault,
				createdAt: ipPools.createdAt,
			})
			.from(ipPools)
			.orderBy(desc(ipPools.createdAt));

		const flash = getFlash(request);
		return reply.view('ip-pools/list.ejs', { currentPath: '/ip-pools', flash, pools });
	});

	app.get<{ Params: { id: string } }>('/ip-pools/:id', async (request, reply) => {
		const db = getDb();
		const [pool] = await db
			.select()
			.from(ipPools)
			.where(eq(ipPools.id, request.params.id))
			.limit(1);

		if (!pool) {
			return reply.redirect('/admin/ip-pools');
		}

		const ips = await db
			.select()
			.from(ipAddresses)
			.where(eq(ipAddresses.poolId, pool.id))
			.orderBy(ipAddresses.address);

		// Live reverse DNS lookup for each IP
		const ptrLookups = await Promise.all(
			ips.map(async (ip) => {
				const result = await reverseDnsLookup(ip.address);
				return { id: ip.id, ...result };
			}),
		);
		const ptrResults: Record<string, { ptrRecords: string[]; error?: string }> = {};
		for (const r of ptrLookups) {
			ptrResults[r.id] = { ptrRecords: r.ptrRecords, error: r.error };
		}

		const flash = getFlash(request);
		return reply.view('ip-pools/detail.ejs', {
			currentPath: '/ip-pools',
			flash,
			pool,
			ips,
			ptrResults,
		});
	});

	app.post<{ Body: { name: string } }>('/ip-pools', async (request, reply) => {
		const { name } = request.body;

		if (!name) {
			request.session.set('flash', { type: 'error', message: 'Pool name is required' });
			return reply.redirect('/admin/ip-pools');
		}

		const db = getDb();
		try {
			await db.insert(ipPools).values({ name: name.trim() });
			request.session.set('flash', { type: 'success', message: `Pool "${name}" created` });
		} catch {
			request.session.set('flash', {
				type: 'error',
				message: 'Failed to create pool (name may already exist)',
			});
		}

		return reply.redirect('/admin/ip-pools');
	});

	app.post<{ Params: { id: string }; Body: { address: string } }>(
		'/ip-pools/:id/ips',
		async (request, reply) => {
			const { address } = request.body;

			if (!address) {
				request.session.set('flash', { type: 'error', message: 'IP address is required' });
				return reply.redirect(`/admin/ip-pools/${request.params.id}`);
			}

			const trimmedAddress = address.trim();

			// Auto-lookup reverse DNS for the IP
			const ptr = await reverseDnsLookup(trimmedAddress);
			const hostname = ptr.ptrRecords.length > 0 ? ptr.ptrRecords[0]!.replace(/\.$/, '') : null;

			const db = getDb();
			try {
				await db.insert(ipAddresses).values({
					address: trimmedAddress,
					poolId: request.params.id,
					hostname,
				});
				await writePostfixConfig(db);
				const msg = hostname
					? `IP ${trimmedAddress} added (rDNS: ${hostname})`
					: `IP ${trimmedAddress} added (no PTR record found — reverse DNS must be configured)`;
				request.session.set('flash', { type: hostname ? 'success' : 'info', message: msg });
			} catch {
				request.session.set('flash', {
					type: 'error',
					message: 'Failed to add IP (may already exist)',
				});
			}

			return reply.redirect(`/admin/ip-pools/${request.params.id}`);
		},
	);

	app.post<{ Params: { id: string } }>('/ip-pools/:id/delete', async (request, reply) => {
		const db = getDb();
		await db.delete(ipPools).where(eq(ipPools.id, request.params.id));
		await writePostfixConfig(db);
		request.session.set('flash', { type: 'success', message: 'Pool deleted' });
		return reply.redirect('/admin/ip-pools');
	});

	app.post<{ Params: { poolId: string; ipId: string } }>(
		'/ip-pools/:poolId/ips/:ipId/delete',
		async (request, reply) => {
			const db = getDb();
			await db.delete(ipAddresses).where(eq(ipAddresses.id, request.params.ipId));
			await writePostfixConfig(db);
			request.session.set('flash', { type: 'success', message: 'IP removed' });
			return reply.redirect(`/admin/ip-pools/${request.params.poolId}`);
		},
	);

	// JSON API: DNSBL check for an IP address
	app.get<{ Params: { ipId: string } }>('/ip-pools/api/dnsbl/:ipId', async (request, reply) => {
		const db = getDb();
		const [ip] = await db
			.select({ address: ipAddresses.address })
			.from(ipAddresses)
			.where(eq(ipAddresses.id, request.params.ipId))
			.limit(1);

		if (!ip) {
			return reply.code(404).send({ error: 'IP not found' });
		}

		const results = await checkAllDnsbl(ip.address);
		return reply.send({
			ip: ip.address,
			results: results.map((r) => ({
				name: r.provider.name,
				zone: r.provider.zone,
				url: r.provider.url,
				listed: r.listed,
				error: r.error ?? null,
			})),
		});
	});
}
