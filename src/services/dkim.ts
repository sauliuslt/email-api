import { generateKeyPairSync } from 'node:crypto';

export interface DkimKeyPair {
	privateKey: string;
	publicKey: string;
}

export function generateDkimKeyPair(): DkimKeyPair {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	return { privateKey, publicKey };
}
