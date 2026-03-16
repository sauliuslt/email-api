import { z } from 'zod';

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
	to: emailSchema,
	subject: z.string().min(1).max(998),
	text: z.string().optional(),
	html: z.string().optional(),
});

export const apiKeyCreateSchema = z.object({
	name: z.string().min(1).max(255),
	domainId: z.string().uuid().optional(),
	permissions: z.array(z.string()).optional(),
});

export const suppressionCreateSchema = z.object({
	email: emailSchema,
	details: z.string().max(1000).optional(),
});
