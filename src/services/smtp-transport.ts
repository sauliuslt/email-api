import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';

const transporterCache = new Map<number, Transporter>();

export function getTransporter(port?: number): Transporter {
	const smtpPort = port ?? env().SMTP_PORT;
	let transporter = transporterCache.get(smtpPort);
	if (!transporter) {
		const useTls = env().SMTP_TLS;
		transporter = nodemailer.createTransport({
			host: env().SMTP_HOST,
			port: smtpPort,
			secure: useTls,
			ignoreTLS: !useTls,
		});
		transporterCache.set(smtpPort, transporter);
	}
	return transporter;
}

export interface SmtpSendOptions {
	from: string;
	to: string;
	subject: string;
	text?: string;
	html?: string;
	messageId: string;
	dkim: {
		domainName: string;
		keySelector: string;
		privateKey: string;
	};
	listUnsubscribe?: string;
	returnPath?: string;
	smtpPort?: number;
}

export async function sendSmtp(options: SmtpSendOptions): Promise<{ response: string }> {
	const transporter = getTransporter(options.smtpPort);

	const headers: Record<string, string> = {};
	if (options.listUnsubscribe) {
		headers['List-Unsubscribe'] = options.listUnsubscribe;
		headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
	}

	const result = await transporter.sendMail({
		from: options.from,
		to: options.to,
		subject: options.subject,
		text: options.text,
		html: options.html,
		messageId: options.messageId,
		headers,
		...(options.returnPath && {
			envelope: { from: options.returnPath, to: options.to },
		}),
		dkim: {
			domainName: options.dkim.domainName,
			keySelector: options.dkim.keySelector,
			privateKey: options.dkim.privateKey,
		},
	});

	return { response: result.response };
}
