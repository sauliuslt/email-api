import { describe, expect, it } from 'vitest';
import { domains, ipAddresses, ipPools } from '../../src/db/schema/index.js';
import { generatePostfixConfig } from '../../src/services/postfix-config.js';

function createDbStub() {
	const allDomainsData = [
		{ id: 'd1', name: 'assigned.example', ipPoolId: 'pool-assigned' },
		{ id: 'd2', name: 'default.example', ipPoolId: null },
	];
	const defaultPool = { id: 'pool-default' };
	const allIps = [
		{
			id: 'ip-default',
			address: '203.0.113.10',
			poolId: 'pool-default',
			hostname: 'mail.default.example',
		},
		{
			id: 'ip-assigned',
			address: '203.0.113.20',
			poolId: 'pool-assigned',
			hostname: 'mail.assigned.example',
		},
	];

	return {
		select(selection?: Record<string, unknown>) {
			const selectedKeys = selection ? Object.keys(selection).sort().join(',') : '*';
			return {
				from(table: unknown) {
					if (table === domains && selectedKeys === 'id,ipPoolId,name') {
						return Promise.resolve(allDomainsData);
					}
					if (table === ipAddresses && selectedKeys === '*') {
						return Promise.resolve(allIps);
					}
					if (table === ipPools && selectedKeys === 'id') {
						return {
							where() {
								return {
									limit() {
										return Promise.resolve([defaultPool]);
									},
								};
							},
						};
					}
					throw new Error(`Unexpected query for selection ${selectedKeys}`);
				},
			};
		},
	} as never;
}

describe('generatePostfixConfig', () => {
	it('generates per-domain transports with correct HELO and myhostname', async () => {
		const config = await generatePostfixConfig(createDbStub());

		// Each domain gets its own transport
		expect(config.senderTransport).toContain('@assigned.example\ttransport_assigned_example:');
		expect(config.senderTransport).toContain('@default.example\ttransport_default_example:');

		// Per-domain HELO uses the domain name
		expect(config.masterCfTransports).toContain('smtp_helo_name=assigned.example');
		expect(config.masterCfTransports).toContain('smtp_helo_name=default.example');

		// IP binding for domains with pools
		expect(config.masterCfTransports).toContain('smtp_bind_address=203.0.113.20');
		expect(config.masterCfTransports).toContain('smtp_bind_address=203.0.113.10');

		// Global myhostname set to first domain
		expect(config.myhostname).toBe('assigned.example');
	});
});
