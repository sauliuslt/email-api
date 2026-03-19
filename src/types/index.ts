import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
	events,
	apiKeys,
	domains,
	ipAddresses,
	ipPools,
	messages,
	suppressionList,
	warmupSchedules,
} from '../db/schema/index.js';

export type Domain = InferSelectModel<typeof domains>;
export type NewDomain = InferInsertModel<typeof domains>;

export type ApiKey = InferSelectModel<typeof apiKeys>;
export type NewApiKey = InferInsertModel<typeof apiKeys>;

export type IpPool = InferSelectModel<typeof ipPools>;
export type NewIpPool = InferInsertModel<typeof ipPools>;

export type IpAddress = InferSelectModel<typeof ipAddresses>;
export type NewIpAddress = InferInsertModel<typeof ipAddresses>;

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;

export type Suppression = InferSelectModel<typeof suppressionList>;
export type NewSuppression = InferInsertModel<typeof suppressionList>;

export type WarmupSchedule = InferSelectModel<typeof warmupSchedules>;

export interface SendMessagePayload {
	from: string;
	fromName?: string;
	to: string;
	subject: string;
	text?: string;
	html?: string;
}

export interface DnsRecord {
	type: 'TXT' | 'CNAME' | 'A' | 'PTR';
	name: string;
	value: string;
}
