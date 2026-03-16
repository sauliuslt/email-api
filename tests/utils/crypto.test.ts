import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from '../../src/utils/crypto.js';

describe('crypto utils', () => {
	it('generates an API key with prefix and hash', () => {
		const { key, prefix, hash } = generateApiKey();

		expect(key).toMatch(/^key-[a-f0-9]{64}$/);
		expect(prefix).toBe(key.slice(0, 8));
		expect(hash).toHaveLength(64);
	});

	it('generates unique keys', () => {
		const a = generateApiKey();
		const b = generateApiKey();

		expect(a.key).not.toBe(b.key);
		expect(a.hash).not.toBe(b.hash);
	});

	it('hashApiKey is deterministic', () => {
		const key = 'key-abc123';
		expect(hashApiKey(key)).toBe(hashApiKey(key));
	});

	it('hashApiKey produces SHA-256 hex', () => {
		const hash = hashApiKey('test');
		expect(hash).toHaveLength(64);
		expect(hash).toMatch(/^[a-f0-9]+$/);
	});
});
