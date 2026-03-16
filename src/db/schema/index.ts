import {
	boolean,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';

// ── IP Pools ──

export const ipPools = pgTable('ip_pools', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	isDefault: boolean('is_default').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── IP Addresses ──

export const ipAddresses = pgTable('ip_addresses', {
	id: uuid('id').primaryKey().defaultRandom(),
	address: text('address').notNull().unique(),
	poolId: uuid('pool_id')
		.notNull()
		.references(() => ipPools.id, { onDelete: 'cascade' }),
	hostname: text('hostname'),
	warmupStage: integer('warmup_stage').notNull().default(0),
	dailyLimit: integer('daily_limit').notNull().default(50),
	sentToday: integer('sent_today').notNull().default(0),
	reputationScore: numeric('reputation_score', { precision: 5, scale: 2 })
		.notNull()
		.default('100'),
	postfixPort: integer('postfix_port').notNull().default(25),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Domains ──

export const domains = pgTable('domains', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	spfVerified: boolean('spf_verified').notNull().default(false),
	dkimVerified: boolean('dkim_verified').notNull().default(false),
	dmarcVerified: boolean('dmarc_verified').notNull().default(false),
	dkimSelector: text('dkim_selector').notNull().default('mail'),
	dkimPrivateKey: text('dkim_private_key').notNull(),
	dkimPublicKey: text('dkim_public_key').notNull(),
	ipPoolId: uuid('ip_pool_id').references(() => ipPools.id, { onDelete: 'set null' }),
	webhooks: jsonb('webhooks').$type<Record<string, string>>().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── API Keys ──

export const apiKeys = pgTable('api_keys', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	keyPrefix: text('key_prefix').notNull(),
	keyHash: text('key_hash').notNull().unique(),
	domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
	permissions: jsonb('permissions').$type<string[]>().default([]),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Messages ──

export const messageStatusEnum = pgEnum('message_status', [
	'queued',
	'sending',
	'delivered',
	'bounced',
	'failed',
	'rejected',
]);

export const messages = pgTable('messages', {
	id: uuid('id').primaryKey().defaultRandom(),
	domainId: uuid('domain_id')
		.notNull()
		.references(() => domains.id, { onDelete: 'cascade' }),
	from: text('from_address').notNull(),
	to: text('to_address').notNull(),
	subject: text('subject').notNull(),
	textBody: text('text_body'),
	htmlBody: text('html_body'),
	status: messageStatusEnum('status').notNull().default('queued'),
	ipAddressId: uuid('ip_address_id').references(() => ipAddresses.id),
	messageIdHeader: text('message_id_header'),
	postfixQueueId: text('postfix_queue_id'),
	smtpResponse: text('smtp_response'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Events ──

export const eventTypeEnum = pgEnum('event_type', [
	'accepted',
	'delivered',
	'bounced',
	'failed',
	'opened',
	'clicked',
	'complained',
	'unsubscribed',
]);

export const eventSeverityEnum = pgEnum('event_severity', [
	'info',
	'warning',
	'error',
	'temporary',
	'permanent',
]);

export const events = pgTable('events', {
	id: uuid('id').primaryKey().defaultRandom(),
	messageId: uuid('message_id')
		.notNull()
		.references(() => messages.id, { onDelete: 'cascade' }),
	type: eventTypeEnum('type').notNull(),
	severity: eventSeverityEnum('severity').notNull().default('info'),
	recipient: text('recipient').notNull(),
	details: jsonb('details').$type<Record<string, unknown>>().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Suppression List ──

export const suppressionReasonEnum = pgEnum('suppression_reason', [
	'bounce',
	'unsubscribe',
	'complaint',
]);

export const suppressionList = pgTable(
	'suppression_list',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		domainId: uuid('domain_id')
			.notNull()
			.references(() => domains.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		reason: suppressionReasonEnum('reason').notNull(),
		details: text('details'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [unique('uq_domain_email').on(t.domainId, t.email)],
);

// ── Warmup Schedules ──

export const warmupSchedules = pgTable('warmup_schedules', {
	id: uuid('id').primaryKey().defaultRandom(),
	day: integer('day').notNull().unique(),
	dailyLimit: integer('daily_limit').notNull(),
});
