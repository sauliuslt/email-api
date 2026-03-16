import net from 'node:net';
import { env } from '../config/env.js';

export interface SpamRule {
	score: number;
	name: string;
	description: string;
}

export interface SpamCheckResult {
	score: number;
	threshold: number;
	isSpam: boolean;
	rules: SpamRule[];
}

/**
 * Check an email message against SpamAssassin (spamd) via the spamc protocol.
 * Builds a minimal RFC822 message from the parts and sends it to spamd for scoring.
 */
export async function checkSpam(options: {
	from: string;
	to: string;
	subject: string;
	text?: string;
	html?: string;
}): Promise<SpamCheckResult> {
	const config = env();

	// Sanitize header values to prevent header injection
	const sanitize = (v: string) => v.replace(/[\r\n]/g, '');

	// Build a realistic RFC822 message for spamd (matching what Nodemailer would generate)
	const message = `From: ${sanitize(options.from)}\r\nTo: ${sanitize(options.to)}\r\nSubject: ${sanitize(options.subject)}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@spam-check>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${options.text || options.html || ''}`;

	const messageBytes = Buffer.from(message);
	const response = await sendToSpamd(config.SPAMD_HOST, config.SPAMD_PORT, messageBytes);

	return parseSpamResponse(response, config.SPAM_SCORE_THRESHOLD);
}

function sendToSpamd(host: string, port: number, message: Buffer): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port }, () => {
			// spamc REPORT protocol - returns score + rule breakdown
			const header = `REPORT SPAMC/1.5\r\nContent-length: ${message.length}\r\n\r\n`;
			socket.write(header);
			socket.write(message);
			// Signal end of request so spamd starts processing
			socket.end();
		});

		let data = '';
		socket.on('data', (chunk) => {
			data += chunk.toString();
		});
		socket.on('end', () => resolve(data));
		socket.on('error', reject);
		socket.setTimeout(30000, () => {
			socket.destroy();
			reject(new Error('SpamAssassin check timed out'));
		});
	});
}

function parseSpamResponse(response: string, threshold: number): SpamCheckResult {
	// Response format:
	// SPAMD/1.1 0 EX_OK
	// Spam: True ; 15.0 / 5.0
	// or
	// Spam: False ; 1.2 / 5.0
	const spamLine = response.split('\n').find((l) => l.startsWith('Spam:'));
	let score = 0;
	let isSpam = false;

	if (spamLine) {
		const match = spamLine.match(/Spam:\s*(True|False)\s*;\s*([\d.]+)\s*\/\s*([\d.]+)/i);
		if (match) {
			isSpam = match[1]!.toLowerCase() === 'true';
			score = Number.parseFloat(match[2]!);
		}
	}

	// Override with our own threshold
	isSpam = score >= threshold;

	// Parse per-rule scores from REPORT output
	// Format: " 2.3 EMPTY_MESSAGE          Message appears to have no textual parts"
	const rules: SpamRule[] = [];
	const lines = response.split('\n');
	for (const line of lines) {
		const ruleMatch = line.match(/^\s*(-?[\d.]+)\s+(\S+)\s+(.+)$/);
		if (ruleMatch) {
			rules.push({
				score: Number.parseFloat(ruleMatch[1]!),
				name: ruleMatch[2]!,
				description: ruleMatch[3]!.trim(),
			});
		}
	}

	return { score, threshold, isSpam, rules };
}
