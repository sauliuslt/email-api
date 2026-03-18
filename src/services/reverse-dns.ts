import { getResolver } from './dns-resolver.js';

export interface ReverseDnsResult {
	ipAddress: string;
	ptrRecords: string[];
	matchesHostname: boolean;
	error?: string;
}

export async function reverseDnsLookup(
	ipAddress: string,
	expectedHostname?: string | null,
): Promise<ReverseDnsResult> {
	const resolver = await getResolver();
	try {
		const ptrRecords = await resolver.reverse(ipAddress);
		const matchesHostname = expectedHostname
			? ptrRecords.some(
					(ptr) =>
						ptr.toLowerCase() === expectedHostname.toLowerCase() ||
						ptr.toLowerCase() === `${expectedHostname.toLowerCase()}.`,
				)
			: false;

		return { ipAddress, ptrRecords, matchesHostname };
	} catch (err) {
		const error = err as NodeJS.ErrnoException;
		return {
			ipAddress,
			ptrRecords: [],
			matchesHostname: false,
			error:
				error.code === 'ENOTFOUND' ? 'No PTR record found' : `DNS lookup failed: ${error.code}`,
		};
	}
}
