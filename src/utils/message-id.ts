import { randomBytes } from 'node:crypto';

export function generateMessageId(domain: string): string {
	const id = randomBytes(16).toString('hex');
	return `<${id}@${domain}>`;
}
