import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, isNotNull, isNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { Db } from '../db/connection.js';
import { domains, ipAddresses, ipPools } from '../db/schema/index.js';

function transportName(ipAddress: string): string {
	return `transport_${ipAddress.replace(/[.:]/g, '_')}`;
}

export async function generatePostfixConfig(db: Db): Promise<{
	senderTransport: string;
	masterCfTransports: string;
}> {
	// Get all domains with assigned pools
	const domainsWithPools = await db
		.select({
			domainName: domains.name,
			poolId: domains.ipPoolId,
		})
		.from(domains)
		.where(isNotNull(domains.ipPoolId));

	// Get all IPs grouped by pool
	const allIps = await db.select().from(ipAddresses);

	// Build a map of poolId → IPs
	const poolIps = new Map<string, typeof allIps>();
	for (const ip of allIps) {
		const list = poolIps.get(ip.poolId) ?? [];
		list.push(ip);
		poolIps.set(ip.poolId, list);
	}

	// Also get the default pool for domains without explicit assignment
	const [defaultPool] = await db
		.select({ id: ipPools.id })
		.from(ipPools)
		.where(eq(ipPools.isDefault, true))
		.limit(1);

	const domainsWithoutPools = defaultPool
		? await db.select({ domainName: domains.name }).from(domains).where(isNull(domains.ipPoolId))
		: [];

	// Combine both sets
	const allDomainMappings = [
		...domainsWithPools.map((d) => ({ domainName: d.domainName, poolId: d.poolId! })),
		...(defaultPool
			? domainsWithoutPools.map((d) => ({ domainName: d.domainName, poolId: defaultPool.id }))
			: []),
	];

	// Generate sender_transport lines
	// Each domain maps to the first IP in its pool (Postfix routes by sender domain)
	const senderLines: string[] = [];

	for (const mapping of allDomainMappings) {
		const ips = poolIps.get(mapping.poolId);
		if (!ips || ips.length === 0) continue;

		// Use the first IP in the pool for this domain
		const ip = ips[0]!;
		const name = transportName(ip.address);
		senderLines.push(`@${mapping.domainName}\t${name}:`);
	}

	// Generate master.cf transport entries for all IPs (not just used ones)
	const masterLines: string[] = [];
	for (const ip of allIps) {
		const name = transportName(ip.address);
		const helo = ip.hostname || `mail.${ip.address}`;
		masterLines.push(
			`${name}    unix  -       -       n       -       -       smtp`,
			`  -o smtp_bind_address=${ip.address}`,
			`  -o smtp_helo_name=${helo}`,
			`  -o syslog_name=postfix-${ip.address}`,
		);
	}

	return {
		senderTransport: `${senderLines.join('\n')}\n`,
		masterCfTransports: `${masterLines.join('\n')}\n`,
	};
}

export async function writePostfixConfig(db: Db): Promise<void> {
	const configDir = env().POSTFIX_CONFIG_DIR;
	const config = await generatePostfixConfig(db);

	await writeFile(path.join(configDir, 'sender_transport'), config.senderTransport);
	await writeFile(path.join(configDir, 'master_transports.cf'), config.masterCfTransports);

	// Touch trigger file to signal Postfix to reload
	await writeFile(path.join(configDir, '.reload-trigger'), Date.now().toString());
}
