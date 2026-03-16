import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { env } from '../config/env.js';

let _resolver: Resolver | null = null;
let _resolverReady: Promise<void> | null = null;

async function initResolver(): Promise<void> {
	_resolver = new Resolver();
	const server = env().DNS_RESOLVER;
	if (server) {
		// Resolver.setServers() requires IP addresses, not hostnames
		// Resolve the hostname to an IP first using the default system DNS
		const ip = await new Promise<string>((resolve, reject) => {
			dns.lookup(server, { family: 4 }, (err, address) => {
				if (err) reject(err);
				else resolve(address);
			});
		});
		_resolver.setServers([ip]);
	}
}

export async function getResolver(): Promise<Resolver> {
	if (!_resolverReady) {
		_resolverReady = initResolver();
	}
	await _resolverReady;
	return _resolver!;
}
