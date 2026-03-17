import { describe, expect, it } from 'vitest';
import { getRequiredDnsRecords } from '../../src/utils/dns.js';

describe('dns utils', () => {
	const publicKey =
		'-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0\n-----END PUBLIC KEY-----';

	it('returns SPF, DKIM, DMARC, A, and PTR records', () => {
		const records = getRequiredDnsRecords('example.com', 'mail', publicKey);

		expect(records).toHaveLength(5);

		const spf = records.find((r) => r.name === 'example.com');
		expect(spf?.value).toContain('v=spf1');

		const dkim = records.find((r) => r.name === 'mail._domainkey.example.com');
		expect(dkim?.value).toContain('v=DKIM1');
		expect(dkim?.value).toContain('k=rsa');

		const dmarc = records.find((r) => r.name === '_dmarc.example.com');
		expect(dmarc?.value).toContain('v=DMARC1');

		const aRecord = records.find((r) => r.type === 'A');
		expect(aRecord?.name).toBe('example.com');
		expect(aRecord?.value).toBe('YOUR_SERVER_IP');

		const ptr = records.find((r) => r.type === 'PTR');
		expect(ptr?.name).toBe('YOUR_SERVER_IP');
		expect(ptr?.value).toBe('example.com');
	});

	it('uses domain directly for A and PTR records', () => {
		const records = getRequiredDnsRecords('mail.example.com', 'mail', publicKey);

		const aRecord = records.find((r) => r.type === 'A');
		expect(aRecord?.name).toBe('mail.example.com');

		const ptr = records.find((r) => r.type === 'PTR');
		expect(ptr?.value).toBe('mail.example.com');
	});

	it('creates per-IP A and PTR records when ipAddresses provided', () => {
		const records = getRequiredDnsRecords('example.com', 'mail', publicKey, ['1.2.3.4', '5.6.7.8']);

		const aRecords = records.filter((r) => r.type === 'A');
		expect(aRecords).toHaveLength(2);
		expect(aRecords[0].value).toBe('1.2.3.4');
		expect(aRecords[1].value).toBe('5.6.7.8');

		const ptrRecords = records.filter((r) => r.type === 'PTR');
		expect(ptrRecords).toHaveLength(2);
		expect(ptrRecords[0].name).toBe('1.2.3.4');
		expect(ptrRecords[1].name).toBe('5.6.7.8');

		const spf = records.find((r) => r.name === 'example.com');
		expect(spf?.value).toContain('ip4:1.2.3.4');
		expect(spf?.value).toContain('ip4:5.6.7.8');
	});
});
