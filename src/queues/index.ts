import { env } from '../config/env.js';

export function getRedisConnectionOpts() {
	const url = new URL(env().REDIS_URL);
	return {
		host: url.hostname,
		port: Number(url.port) || 6379,
		maxRetriesPerRequest: null,
	};
}
