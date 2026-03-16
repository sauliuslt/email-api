import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { env } from '../config/env.js';
import { getDb } from '../db/connection.js';
import { events, domains, ipAddresses, messages } from '../db/schema/index.js';
import { getRedisConnectionOpts } from '../queues/index.js';
import type { SendJobData } from '../queues/send-queue.js';
import { sendSmtp } from '../services/smtp-transport.js';
import { checkSpam } from '../services/spam-check.js';

export function createSendWorker(): Worker<SendJobData> {
	const logger = pino({ level: env().LOG_LEVEL });

	const worker = new Worker<SendJobData>(
		'send-email',
		async (job) => {
			const db = getDb();
			const { messageId, domainId } = job.data;

			// Get message
			const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);

			if (!message) throw new Error(`Message ${messageId} not found`);

			// Get domain for DKIM
			const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);

			if (!domain) throw new Error(`Domain ${domainId} not found`);

			// Get assigned IP's port (if any)
			let smtpPort: number | undefined;
			if (message.ipAddressId) {
				const [ip] = await db
					.select({ postfixPort: ipAddresses.postfixPort })
					.from(ipAddresses)
					.where(eq(ipAddresses.id, message.ipAddressId))
					.limit(1);
				smtpPort = ip?.postfixPort;
			}

			// Update status to sending
			await db
				.update(messages)
				.set({ status: 'sending', updatedAt: new Date() })
				.where(eq(messages.id, messageId));

			// Spam check before sending
			try {
				const spamResult = await checkSpam({
					from: message.from,
					to: message.to,
					subject: message.subject,
					text: message.textBody ?? undefined,
					html: message.htmlBody ?? undefined,
				});

				if (spamResult.isSpam) {
					await db
						.update(messages)
						.set({ status: 'rejected', updatedAt: new Date() })
						.where(eq(messages.id, messageId));

					await db.insert(events).values({
						messageId,
						type: 'failed',
						severity: 'error',
						recipient: message.to,
						details: {
							reason: 'Spam check failed',
							score: spamResult.score,
							threshold: spamResult.threshold,
							rules: spamResult.rules,
						},
					});

					logger.info(
						{ messageId, score: spamResult.score, threshold: spamResult.threshold },
						'Message rejected: spam score exceeded threshold',
					);
					return;
				}

				// Log spam score even if passed
				await db.insert(events).values({
					messageId,
					type: 'accepted',
					severity: 'info',
					recipient: message.to,
					details: {
						note: 'Spam check passed',
						score: spamResult.score,
						threshold: spamResult.threshold,
						rules: spamResult.rules,
					},
				});
			} catch (spamErr) {
				// If spamd is unavailable, log warning but continue sending
				logger.warn(
					{ messageId, error: (spamErr as Error).message },
					'Spam check failed, sending anyway',
				);
			}

			try {
				const result = await sendSmtp({
					from: message.from,
					to: message.to,
					subject: message.subject,
					text: message.textBody ?? undefined,
					html: message.htmlBody ?? undefined,
					messageId: message.messageIdHeader ?? `<${messageId}@${domain.name}>`,
					dkim: {
						domainName: domain.name,
						keySelector: domain.dkimSelector,
						privateKey: domain.dkimPrivateKey,
					},
					smtpPort,
				});

				// Parse Postfix queue ID from response: "250 2.0.0 Ok: queued as XXXXX"
				const queueIdMatch = result.response.match(/queued as ([A-F0-9]+)/i);
				const postfixQueueId = queueIdMatch?.[1] ?? null;

				// Postfix accepted - now in transit. Final status comes from log watcher.
				await db
					.update(messages)
					.set({
						status: 'sending',
						postfixQueueId,
						smtpResponse: result.response,
						updatedAt: new Date(),
					})
					.where(eq(messages.id, messageId));

				await db.insert(events).values({
					messageId,
					type: 'accepted',
					severity: 'info',
					recipient: message.to,
					details: { response: result.response, postfixQueueId },
				});
			} catch (err) {
				const error = err as Error;
				const errorMsg = error.message || '';

				// Parse SMTP error codes from Nodemailer
				const isBounce =
					/5\d{2}\s/.test(errorMsg) ||
					errorMsg.includes('rejected') ||
					errorMsg.includes('bounced');
				const isTemporary = /4\d{2}\s/.test(errorMsg) || errorMsg.includes('Temporary');
				const status = isBounce ? 'bounced' : isTemporary ? 'failed' : 'failed';
				const eventType = isBounce ? 'bounced' : 'failed';

				await db
					.update(messages)
					.set({ status, updatedAt: new Date() })
					.where(eq(messages.id, messageId));

				await db.insert(events).values({
					messageId,
					type: eventType,
					severity: 'error',
					recipient: message.to,
					details: { error: errorMsg },
				});

				throw error;
			}
		},
		{
			connection: getRedisConnectionOpts(),
			concurrency: 10,
		},
	);

	worker.on('failed', (job, err) => {
		logger.error({ jobId: job?.id, error: err.message }, 'Send job failed');
	});

	return worker;
}
