import { z } from 'zod';
import { PERMISSIONS } from './auth.js';

export const domainNameSchema = z
	.string()
	.min(1)
	.max(253)
	.regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, {
		message: 'Invalid domain name format',
	});

export const emailSchema = z
	.string()
	.min(3)
	.max(254)
	.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Invalid email format' });

export const sendMessageSchema = z.object({
	from: emailSchema,
	fromName: z.string().max(255).optional(),
	to: emailSchema,
	subject: z.string().min(1).max(998),
	text: z.string().max(512_000).optional(),
	html: z.string().max(512_000).optional(),
});

const permissionValues = Object.values(PERMISSIONS) as [string, ...string[]];

export const apiKeyCreateSchema = z.object({
	name: z.string().min(1).max(255),
	domainId: z.string().uuid().optional(),
	permissions: z.array(z.enum(permissionValues)).optional(),
});

export const suppressionCreateSchema = z.object({
	email: emailSchema,
	details: z.string().max(1000).optional(),
});
