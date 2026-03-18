import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { simpleParser } from 'mailparser';
import type { Db } from '../db/connection.js';
import { events, inboundEmails, messages } from '../db/schema/index.js';
import { addSuppression } from './suppression.js';

export { addSuppression };

export interface InboundEmailInput {
	sender: string;
	recipient: string;
	rawEmail: string; // base64-encoded
}

export interface InboundResult {
	id: string;
	classification: 'bounce' | 'complaint' | 'unsubscribe' | 'unknown';
	matched: boolean;
	messageId: string | null;
	suppressed: boolean;
}

/**
 * Parse VERP address: bounce+{uuid}@domain or unsubscribe+{uuid}@domain → { id, type }
 */
function parseVerpRecipient(
	recipient: string,
): { id: string; type: 'bounce' | 'unsubscribe' } | null {
	const match = recipient.match(/^(bounce|unsubscribe)\+([0-9a-f-]{36})@/i);
	if (!match?.[1] || !match[2]) return null;
	return { id: match[2], type: match[1].toLowerCase() as 'bounce' | 'unsubscribe' };
}

/**
 * Parse DSN status code from multipart/report
 */
function parseDsnStatus(text: string): { status?: string; originalRecipient?: string } {
	const statusMatch = text.match(/Status:\s*(\d\.\d+\.\d+)/i);
	const recipientMatch =
		text.match(/Final-Recipient:\s*rfc822;\s*(.+)/i) ??
		text.match(/Original-Recipient:\s*rfc822;\s*(.+)/i);
	return {
		status: statusMatch?.[1],
		originalRecipient: recipientMatch?.[1]?.trim(),
	};
}

/**
 * Classify inbound email based on content analysis
 */
function classifyEmail(
	parsed: Awaited<ReturnType<typeof simpleParser>>,
	recipient: string,
): 'bounce' | 'complaint' | 'unsubscribe' | 'unknown' {
	// Check for ARF complaint (feedback report)
	const contentType = parsed.headers.get('content-type');
	const ctValue =
		typeof contentType === 'object' && contentType !== null && 'value' in contentType
			? (contentType as { value: string }).value
			: String(contentType ?? '');
	if (ctValue.includes('feedback-report') || ctValue.includes('abuse-report')) {
		return 'complaint';
	}

	// VERP address: bounce+ or unsubscribe+
	if (recipient.startsWith('bounce+')) {
		return 'bounce';
	}
	if (recipient.startsWith('unsubscribe+')) {
		return 'unsubscribe';
	}

	// DSN bounce detection
	if (ctValue.includes('multipart/report') || ctValue.includes('delivery-status')) {
		return 'bounce';
	}

	// Check subject for common bounce indicators
	const subject = (parsed.subject ?? '').toLowerCase();
	if (
		subject.includes('undelivered') ||
		subject.includes('delivery status') ||
		subject.includes('delivery failure') ||
		subject.includes('returned mail') ||
		subject.includes('mail delivery failed')
	) {
		return 'bounce';
	}

	// Check for unsubscribe
	if (subject.includes('unsubscribe')) {
		return 'unsubscribe';
	}

	// Check for complaint indicators
	if (subject.includes('complaint') || subject.includes('abuse')) {
		return 'complaint';
	}

	return 'unknown';
}

export async function processInboundEmail(
	db: Db,
	input: InboundEmailInput,
): Promise<InboundResult> {
	// Decode and parse raw email
	const rawBuffer = Buffer.from(input.rawEmail, 'base64');
	const parsed = await simpleParser(rawBuffer);

	const classification = classifyEmail(parsed, input.recipient);

	// Try to match to original message
	let matchedMessageId: string | null = null;
	let matchedMessage: { id: string; domainId: string; to: string } | null = null;

	// 1. VERP: parse recipient for bounce+{uuid}@domain or unsubscribe+{uuid}@domain
	const verp = parseVerpRecipient(input.recipient);
	if (verp) {
		const [msg] = await db
			.select({ id: messages.id, domainId: messages.domainId, to: messages.to })
			.from(messages)
			.where(eq(messages.id, verp.id))
			.limit(1);
		if (msg) {
			matchedMessage = msg;
			matchedMessageId = msg.id;
		}
	}

	// 2. In-Reply-To / References header matching
	if (!matchedMessage) {
		const inReplyTo = parsed.inReplyTo;
		if (inReplyTo) {
			const cleanId = inReplyTo.replace(/^<|>$/g, '');
			const [msg] = await db
				.select({ id: messages.id, domainId: messages.domainId, to: messages.to })
				.from(messages)
				.where(eq(messages.messageIdHeader, inReplyTo))
				.limit(1);
			if (msg) {
				matchedMessage = msg;
				matchedMessageId = msg.id;
			} else {
				// Try without angle brackets
				const [msg2] = await db
					.select({ id: messages.id, domainId: messages.domainId, to: messages.to })
					.from(messages)
					.where(eq(messages.messageIdHeader, cleanId))
					.limit(1);
				if (msg2) {
					matchedMessage = msg2;
					matchedMessageId = msg2.id;
				}
			}
		}
	}

	// 3. DSN: parse original recipient from body
	if (!matchedMessage && parsed.text) {
		const dsn = parseDsnStatus(parsed.text);
		if (dsn.originalRecipient) {
			const [msg] = await db
				.select({ id: messages.id, domainId: messages.domainId, to: messages.to })
				.from(messages)
				.where(eq(messages.to, dsn.originalRecipient))
				.limit(1);
			if (msg) {
				matchedMessage = msg;
				matchedMessageId = msg.id;
			}
		}
	}

	// Build raw headers string
	const headerLines: string[] = [];
	parsed.headers.forEach((value, key) => {
		headerLines.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
	});

	// Store inbound email record
	const inboundId = crypto.randomUUID();
	await db.insert(inboundEmails).values({
		id: inboundId,
		sender: input.sender,
		recipient: input.recipient,
		subject: parsed.subject ?? null,
		messageId: matchedMessageId,
		classification,
		matched: !!matchedMessage,
		rawHeaders: headerLines.join('\n'),
		details: {
			verpId: verp?.id ?? null,
			verpType: verp?.type ?? null,
			inReplyTo: parsed.inReplyTo ?? null,
			references: parsed.references ?? null,
		},
	});

	// Auto-suppress on negative signals
	let suppressed = false;
	if (
		matchedMessage &&
		(classification === 'bounce' ||
			classification === 'complaint' ||
			classification === 'unsubscribe')
	) {
		await addSuppression(
			db,
			matchedMessage.domainId,
			matchedMessage.to,
			classification,
			`Auto-suppressed from inbound ${classification} email`,
		);
		suppressed = true;

		// Insert event on original message
		const eventType =
			classification === 'bounce'
				? 'bounced'
				: classification === 'complaint'
					? 'complained'
					: 'unsubscribed';
		await db.insert(events).values({
			messageId: matchedMessage.id,
			type: eventType,
			severity: classification === 'bounce' || classification === 'complaint' ? 'error' : 'warning',
			recipient: matchedMessage.to,
			details: {
				source: 'inbound_email',
				inboundEmailId: inboundId,
				sender: input.sender,
			},
		});
	}

	return {
		id: inboundId,
		classification,
		matched: !!matchedMessage,
		messageId: matchedMessageId,
		suppressed,
	};
}
