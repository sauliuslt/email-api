import { getResolver } from './dns-resolver.js';

export interface DnsblProvider {
	name: string;
	zone: string;
	url: string;
}

export const DNSBL_PROVIDERS: DnsblProvider[] = [
	{ name: 'Spamhaus ZEN', zone: 'zen.spamhaus.org', url: 'https://www.spamhaus.org' },
	{ name: 'SpamCop', zone: 'bl.spamcop.net', url: 'https://www.spamcop.net' },
	{ name: 'Barracuda', zone: 'b.barracudacentral.org', url: 'https://www.barracudacentral.org' },
	{ name: 'SORBS', zone: 'dnsbl.sorbs.net', url: 'https://www.sorbs.net' },
	{ name: 'UCEPROTECT-1', zone: 'dnsbl-1.uceprotect.net', url: 'https://www.uceprotect.net' },
	{ name: 'Spamhaus SBL', zone: 'sbl.spamhaus.org', url: 'https://www.spamhaus.org/sbl' },
	{ name: 'Spamhaus XBL', zone: 'xbl.spamhaus.org', url: 'https://www.spamhaus.org/xbl' },
	{ name: 'PSBL', zone: 'psbl.surriel.com', url: 'https://psbl.org' },
	{ name: 'CBL', zone: 'cbl.abuseat.org', url: 'https://www.abuseat.org' },
	{ name: 'TRUNCATE', zone: 'truncate.gbudb.net', url: 'https://www.gbudb.com' },
];

export interface DnsblCheckResult {
	provider: DnsblProvider;
	listed: boolean;
	addresses?: string[];
	error?: string;
}

function reverseIp(ip: string): string {
	return ip.split('.').reverse().join('.');
}

async function checkSingleDnsbl(ip: string, provider: DnsblProvider): Promise<DnsblCheckResult> {
	const query = `${reverseIp(ip)}.${provider.zone}`;
	const resolver = await getResolver();
	try {
		const addresses = await resolver.resolve4(query);
		return { provider, listed: true, addresses };
	} catch (err) {
		const error = err as NodeJS.ErrnoException;
		if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
			return { provider, listed: false };
		}
		return { provider, listed: false, error: `Lookup failed: ${error.code}` };
	}
}

export async function checkAllDnsbl(ip: string): Promise<DnsblCheckResult[]> {
	return Promise.all(DNSBL_PROVIDERS.map((provider) => checkSingleDnsbl(ip, provider)));
}
