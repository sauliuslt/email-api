import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/connection.js';
import { domains, ipAddresses, ipPools } from '../db/schema/index.js';

export async function selectIpForDomain(
	db: Db,
	domainId: string,
): Promise<{ id: string; address: string; postfixPort: number } | null> {
	// Get the domain's pool, or fall back to default pool
	const [domain] = await db
		.select({ ipPoolId: domains.ipPoolId })
		.from(domains)
		.where(eq(domains.id, domainId))
		.limit(1);

	let poolId = domain?.ipPoolId;

	if (!poolId) {
		const [defaultPool] = await db
			.select({ id: ipPools.id })
			.from(ipPools)
			.where(eq(ipPools.isDefault, true))
			.limit(1);
		poolId = defaultPool?.id ?? null;
	}

	if (!poolId) return null;

	// Pick the best available IP: under daily limit, lowest sent count, highest reputation
	const [ip] = await db
		.select({
			id: ipAddresses.id,
			address: ipAddresses.address,
			postfixPort: ipAddresses.postfixPort,
		})
		.from(ipAddresses)
		.where(
			and(
				eq(ipAddresses.poolId, poolId),
				sql`${ipAddresses.sentToday} < ${ipAddresses.dailyLimit}`,
			),
		)
		.orderBy(asc(ipAddresses.sentToday), desc(ipAddresses.reputationScore))
		.limit(1);

	return ip ?? null;
}

export async function incrementSentCount(db: Db, ipAddressId: string): Promise<void> {
	await db
		.update(ipAddresses)
		.set({
			sentToday: sql`${ipAddresses.sentToday} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(ipAddresses.id, ipAddressId));
}
