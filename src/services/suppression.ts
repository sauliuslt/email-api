import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/connection.js';
import { suppressionList } from '../db/schema/index.js';

export async function isSuppressed(db: Db, domainId: string, email: string): Promise<boolean> {
	const [found] = await db
		.select({ id: suppressionList.id })
		.from(suppressionList)
		.where(and(eq(suppressionList.domainId, domainId), eq(suppressionList.email, email)))
		.limit(1);
	return !!found;
}

export async function addSuppression(
	db: Db,
	domainId: string,
	email: string,
	reason: 'bounce' | 'unsubscribe' | 'complaint',
	details?: string,
): Promise<void> {
	await db
		.insert(suppressionList)
		.values({ domainId, email, reason, details })
		.onDuplicateKeyUpdate({ set: { id: sql`id` } });
}
