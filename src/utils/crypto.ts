import { createHash, randomBytes } from 'node:crypto';

const API_KEY_PREFIX_LENGTH = 8;
const API_KEY_LENGTH = 32;

export function generateApiKey(): { key: string; prefix: string; hash: string } {
	const key = `key-${randomBytes(API_KEY_LENGTH).toString('hex')}`;
	const prefix = key.slice(0, API_KEY_PREFIX_LENGTH);
	const hash = hashApiKey(key);
	return { key, prefix, hash };
}

export function hashApiKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}
