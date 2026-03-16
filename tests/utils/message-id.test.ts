import { describe, expect, it } from 'vitest';
import { generateMessageId } from '../../src/utils/message-id.js';

describe('message-id utils', () => {
	it('generates RFC-compliant message ID', () => {
		const id = generateMessageId('example.com');
		expect(id).toMatch(/^<[a-f0-9]{32}@example\.com>$/);
	});

	it('generates unique IDs', () => {
		const a = generateMessageId('example.com');
		const b = generateMessageId('example.com');
		expect(a).not.toBe(b);
	});
});
