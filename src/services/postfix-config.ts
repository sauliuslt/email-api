import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, isNotNull, isNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { Db } from '../db/connection.js';
import { domains, ipAddresses, ipPools } from '../db/schema/index.js';

function transportName(identifier: string): string {
	return `transport_${identifier.replace(/[.:@-]/g, '_')}`;
}

export async function generatePostfixConfig(db: Db): Promise<{
	senderTransport: string;
	masterCfTransports: string;
	myhostname: string | null;
}> {
	// Get ALL domains
	const allDomains = await db
		.select({
			id: domains.id,
			name: domains.name,
			ipPoolId: domains.ipPoolId,
		})
		.from(domains);

	// Get all IPs grouped by pool
	const allIps = await db.select().from(ipAddresses);

	const poolIps = new Map<string, typeof allIps>();
	for (const ip of allIps) {
		const list = poolIps.get(ip.poolId) ?? [];
		list.push(ip);
		poolIps.set(ip.poolId, list);
	}

	// Get default pool
	const [defaultPool] = await db
		.select({ id: ipPools.id })
		.from(ipPools)
		.where(eq(ipPools.isDefault, true))
		.limit(1);

	// For each domain, resolve its IP and generate a transport
	const senderLines: string[] = [];
	const masterLines: string[] = [];
	const seenTransports = new Set<string>();

	for (const domain of allDomains) {
		const poolId = domain.ipPoolId ?? defaultPool?.id;
		const ips = poolId ? poolIps.get(poolId) : undefined;
		const ip = ips?.[0];

		// Transport name is per-domain (not per-IP) so each domain gets its own HELO
		const name = transportName(domain.name);
		senderLines.push(`@${domain.name}\t${name}:`);

		if (!seenTransports.has(name)) {
			seenTransports.add(name);
			const helo = ip?.hostname || domain.name;
			const bindAddr = ip ? `\n  -o smtp_bind_address=${ip.address}` : '';
			masterLines.push(
				`${name}    unix  -       -       n       -       -       smtp${bindAddr}`,
				`  -o smtp_helo_name=${helo}`,
				`  -o syslog_name=postfix-${domain.name}`,
			);
		}
	}

	// Use first domain as global myhostname fallback
	const myhostname = allDomains[0]?.name ?? null;

	return {
		senderTransport: `${senderLines.join('\n')}\n`,
		masterCfTransports: `${masterLines.join('\n')}\n`,
		myhostname,
	};
}

export async function writePostfixConfig(db: Db): Promise<void> {
	const configDir = env().POSTFIX_CONFIG_DIR;
	const config = await generatePostfixConfig(db);

	await writeFile(path.join(configDir, 'sender_transport'), config.senderTransport);
	await writeFile(path.join(configDir, 'master_transports.cf'), config.masterCfTransports);

	// Write myhostname override so entrypoint can apply it
	if (config.myhostname) {
		await writeFile(path.join(configDir, 'myhostname'), config.myhostname);
	}

	// Touch trigger file to signal Postfix to reload
	await writeFile(path.join(configDir, '.reload-trigger'), Date.now().toString());
}
