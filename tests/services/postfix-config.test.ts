import { describe, expect, it } from 'vitest';
import { domains, ipAddresses, ipPools } from '../../src/db/schema/index.js';
import { generatePostfixConfig } from '../../src/services/postfix-config.js';

function createDbStub() {
	const domainsWithPools = [{ domainName: 'assigned.example', poolId: 'pool-assigned' }];
	const defaultPool = { id: 'pool-default' };
	const domainsWithoutPools = [{ domainName: 'default.example' }];
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
					if (table === domains && selectedKeys === 'domainName,poolId') {
						return {
							where() {
								return Promise.resolve(domainsWithPools);
							},
						};
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
					if (table === domains && selectedKeys === 'domainName') {
						return {
							where() {
								return Promise.resolve(domainsWithoutPools);
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
	it('maps unassigned domains through the default pool without duplicating explicit mappings', async () => {
		const config = await generatePostfixConfig(createDbStub());

		expect(config.senderTransport).toContain('@assigned.example\ttransport_203_0_113_20:');
		expect(config.senderTransport).toContain('@default.example\ttransport_203_0_113_10:');
		expect(config.senderTransport.match(/assigned\.example/g)).toHaveLength(1);
		expect(config.senderTransport.match(/default\.example/g)).toHaveLength(1);
	});
});
