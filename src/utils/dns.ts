import { getResolver } from '../services/dns-resolver.js';
import type { DnsRecord } from '../types/index.js';

export function getRequiredDnsRecords(
	domain: string,
	dkimSelector: string,
	dkimPublicKey: string,
	ipAddresses?: string[],
): DnsRecord[] {
	const publicKeyBase64 = dkimPublicKey
		.replace(/-----BEGIN PUBLIC KEY-----/, '')
		.replace(/-----END PUBLIC KEY-----/, '')
		.replace(/\n/g, '');

	// Build SPF with actual sending IPs
	const ipMechanisms = ipAddresses?.length
		? ipAddresses.map((ip) => `ip4:${ip}`).join(' ')
		: 'ip4:YOUR_SERVER_IP';
	const spfValue = `v=spf1 ${ipMechanisms} -all`;

	const records: DnsRecord[] = [
		{
			type: 'TXT',
			name: domain,
			value: spfValue,
		},
		{
			type: 'TXT',
			name: `${dkimSelector}._domainkey.${domain}`,
			value: `v=DKIM1; k=rsa; p=${publicKeyBase64}`,
		},
		{
			type: 'TXT',
			name: `_dmarc.${domain}`,
			value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
		},
	];

	// A record for the domain itself (used as HELO hostname)
	if (ipAddresses?.length) {
		for (const ip of ipAddresses) {
			records.push({ type: 'A', name: domain, value: ip });
		}
	} else {
		records.push({ type: 'A', name: domain, value: 'YOUR_SERVER_IP' });
	}

	// PTR/rDNS records — should point back to the domain
	if (ipAddresses?.length) {
		for (const ip of ipAddresses) {
			records.push({ type: 'PTR', name: ip, value: domain });
		}
	} else {
		records.push({ type: 'PTR', name: 'YOUR_SERVER_IP', value: domain });
	}

	return records;
}

export async function verifySpf(domain: string): Promise<boolean> {
	try {
		const resolver = await getResolver();
		const records = await resolver.resolveTxt(domain);
		return records.some((r) => r.join('').includes('v=spf1'));
	} catch {
		return false;
	}
}

export async function verifyDkim(domain: string, selector: string): Promise<boolean> {
	try {
		const resolver = await getResolver();
		const records = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
		return records.some((r) => r.join('').includes('v=DKIM1'));
	} catch {
		return false;
	}
}

export async function verifyDmarc(domain: string): Promise<boolean> {
	try {
		const resolver = await getResolver();
		const records = await resolver.resolveTxt(`_dmarc.${domain}`);
		return records.some((r) => r.join('').includes('v=DMARC1'));
	} catch {
		return false;
	}
}
