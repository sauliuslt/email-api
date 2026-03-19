import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/connection.js';
import { events, domains, messages } from '../db/schema/index.js';
import { getSendQueue } from '../queues/send-queue.js';
import type { SendMessagePayload } from '../types/index.js';
import { generateMessageId } from '../utils/message-id.js';
import { selectIpForDomain } from './ip-selector.js';
import { isSuppressed } from './suppression.js';

export async function enqueueMessage(
	db: Db,
	domainName: string,
	payload: SendMessagePayload,
): Promise<{ id: string; status: string }> {
	// Find domain
	const [domain] = await db.select().from(domains).where(eq(domains.name, domainName)).limit(1);

	if (!domain) {
		throw Object.assign(new Error(`Domain '${domainName}' not found`), { statusCode: 404 });
	}

	const to = payload.to;

	// Check suppression list
	const suppressed = await isSuppressed(db, domain.id, to);
	if (suppressed) {
		throw Object.assign(new Error(`Recipient '${to}' is suppressed for this domain`), {
			statusCode: 400,
		});
	}

	// Select outbound IP from domain's pool
	const selectedIp = await selectIpForDomain(db, domain.id);

	const messageIdHeader = generateMessageId(domainName);
	const id = crypto.randomUUID();

	// Insert message record
	await db.insert(messages).values({
		id,
		domainId: domain.id,
		from: payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from,
		to,
		subject: payload.subject,
		textBody: payload.text,
		htmlBody: payload.html,
		status: 'queued',
		messageIdHeader,
		ipAddressId: selectedIp?.id ?? null,
	});

	// Log accepted event
	await db.insert(events).values({
		messageId: id,
		type: 'accepted',
		severity: 'info',
		recipient: to,
		details: {},
	});

	// Enqueue for sending
	await getSendQueue().add('send', {
		messageId: id,
		domainId: domain.id,
	});

	return { id, status: 'queued' };
}
