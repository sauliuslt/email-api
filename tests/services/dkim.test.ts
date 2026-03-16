import { describe, expect, it } from 'vitest';
import { generateDkimKeyPair } from '../../src/services/dkim.js';

describe('DKIM service', () => {
	it('generates a valid RSA 2048-bit key pair', () => {
		const { privateKey, publicKey } = generateDkimKeyPair();

		expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
		expect(privateKey).toContain('-----END PRIVATE KEY-----');
		expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
		expect(publicKey).toContain('-----END PUBLIC KEY-----');
	});

	it('generates unique key pairs', () => {
		const a = generateDkimKeyPair();
		const b = generateDkimKeyPair();
		expect(a.privateKey).not.toBe(b.privateKey);
	});
});
