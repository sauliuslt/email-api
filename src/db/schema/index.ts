import crypto from 'node:crypto';
import {
	boolean,
	decimal,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	unique,
	varchar,
} from 'drizzle-orm/mysql-core';

// ── IP Pools ──

export const ipPools = mysqlTable('ip_pools', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: varchar('name', { length: 255 }).notNull().unique(),
	isDefault: boolean('is_default').notNull().default(false),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── IP Addresses ──

export const ipAddresses = mysqlTable('ip_addresses', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	address: varchar('address', { length: 255 }).notNull().unique(),
	poolId: varchar('pool_id', { length: 36 })
		.notNull()
		.references(() => ipPools.id, { onDelete: 'cascade' }),
	hostname: text('hostname'),
	warmupStage: int('warmup_stage').notNull().default(0),
	dailyLimit: int('daily_limit').notNull().default(50),
	sentToday: int('sent_today').notNull().default(0),
	reputationScore: decimal('reputation_score', { precision: 5, scale: 2 })
		.notNull()
		.default('100'),
	postfixPort: int('postfix_port').notNull().default(25),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Domains ──

export const domains = mysqlTable('domains', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: varchar('name', { length: 255 }).notNull().unique(),
	spfVerified: boolean('spf_verified').notNull().default(false),
	dkimVerified: boolean('dkim_verified').notNull().default(false),
	dmarcVerified: boolean('dmarc_verified').notNull().default(false),
	dkimSelector: varchar('dkim_selector', { length: 255 }).notNull().default('mail'),
	dkimPrivateKey: text('dkim_private_key').notNull(),
	dkimPublicKey: text('dkim_public_key').notNull(),
	ipPoolId: varchar('ip_pool_id', { length: 36 }).references(() => ipPools.id, { onDelete: 'set null' }),
	webhooks: json('webhooks').$type<Record<string, string>>().default({}),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── API Keys ──

export const apiKeys = mysqlTable('api_keys', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: varchar('name', { length: 255 }).notNull(),
	keyPrefix: varchar('key_prefix', { length: 255 }).notNull(),
	keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
	domainId: varchar('domain_id', { length: 36 }).references(() => domains.id, { onDelete: 'cascade' }),
	permissions: json('permissions').$type<string[]>().default([]),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Messages ──

export const messages = mysqlTable('messages', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	domainId: varchar('domain_id', { length: 36 })
		.notNull()
		.references(() => domains.id, { onDelete: 'cascade' }),
	from: varchar('from_address', { length: 255 }).notNull(),
	to: varchar('to_address', { length: 255 }).notNull(),
	subject: text('subject').notNull(),
	textBody: text('text_body'),
	htmlBody: text('html_body'),
	status: mysqlEnum('status', ['queued', 'sending', 'delivered', 'bounced', 'failed', 'rejected']).notNull().default('queued'),
	ipAddressId: varchar('ip_address_id', { length: 36 }).references(() => ipAddresses.id),
	messageIdHeader: varchar('message_id_header', { length: 255 }),
	postfixQueueId: varchar('postfix_queue_id', { length: 255 }),
	smtpResponse: text('smtp_response'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Events ──

export const events = mysqlTable('events', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	messageId: varchar('message_id', { length: 36 })
		.notNull()
		.references(() => messages.id, { onDelete: 'cascade' }),
	type: mysqlEnum('type', [
		'accepted',
		'delivered',
		'bounced',
		'failed',
		'opened',
		'clicked',
		'complained',
		'unsubscribed',
	]).notNull(),
	severity: mysqlEnum('severity', ['info', 'warning', 'error', 'temporary', 'permanent']).notNull().default('info'),
	recipient: varchar('recipient', { length: 255 }).notNull(),
	details: json('details').$type<Record<string, unknown>>().default({}),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Suppression List ──

export const suppressionList = mysqlTable(
	'suppression_list',
	{
		id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
		domainId: varchar('domain_id', { length: 36 })
			.notNull()
			.references(() => domains.id, { onDelete: 'cascade' }),
		email: varchar('email', { length: 255 }).notNull(),
		reason: mysqlEnum('reason', ['bounce', 'unsubscribe', 'complaint']).notNull(),
		details: text('details'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
	},
	(t) => [unique('uq_domain_email').on(t.domainId, t.email)],
);

// ── Warmup Schedules ──

export const warmupSchedules = mysqlTable('warmup_schedules', {
	id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	day: int('day').notNull().unique(),
	dailyLimit: int('daily_limit').notNull(),
});
