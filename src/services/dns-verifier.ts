import { eq } from 'drizzle-orm';
import type { Db } from '../db/connection.js';
import { domains } from '../db/schema/index.js';
import { verifyDkim, verifyDmarc, verifySpf } from '../utils/dns.js';

export async function verifyDomainDns(
	db: Db,
	domainId: string,
): Promise<{ spf: boolean; dkim: boolean; dmarc: boolean }> {
	const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);

	if (!domain) throw new Error('Domain not found');

	const [spf, dkim, dmarc] = await Promise.all([
		verifySpf(domain.name),
		verifyDkim(domain.name, domain.dkimSelector),
		verifyDmarc(domain.name),
	]);

	await db
		.update(domains)
		.set({
			spfVerified: spf,
			dkimVerified: dkim,
			dmarcVerified: dmarc,
			updatedAt: new Date(),
		})
		.where(eq(domains.id, domainId));

	return { spf, dkim, dmarc };
}
