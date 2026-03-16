import { z } from 'zod';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3000),
		HOST: z.string().default('0.0.0.0'),
		NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

		DATABASE_URL: z.string().url(),
		REDIS_URL: z.string().url(),

		SMTP_HOST: z.string().default('localhost'),
		SMTP_PORT: z.coerce.number().default(25),
		SMTP_TLS: z.coerce.boolean().default(false),

		SPAMD_HOST: z.string().default('localhost'),
		SPAMD_PORT: z.coerce.number().default(783),
		SPAM_SCORE_THRESHOLD: z.coerce.number().default(5.0),

		API_URL: z.string().url().default('http://localhost:3000'),
		MASTER_API_KEY: z.string().min(8),
		INTERNAL_API_SECRET: z.string().min(16),

		CORS_ORIGINS: z.string().default('*'),
		RATE_LIMIT_MAX: z.coerce.number().default(100),
		RATE_LIMIT_SEND_MAX: z.coerce.number().default(30),

		POSTFIX_CONFIG_DIR: z.string().default('./config/postfix'),
		DNS_RESOLVER: z.string().optional(),
		COOKIE_SECURE: z.coerce.boolean().default(false),
		ADMIN_PASSWORD: z.string().min(8).optional(),
		ADMIN_PASSWORD_HASH: z.string().optional(),
		SESSION_SECRET: z.string().min(32),
	})
	.refine((data) => data.ADMIN_PASSWORD || data.ADMIN_PASSWORD_HASH, {
		message: 'Either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH must be set',
	});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
	if (_env) return _env;
	_env = envSchema.parse(process.env);
	return _env;
}

export function env(): Env {
	if (!_env) throw new Error('env() called before loadEnv()');
	return _env;
}
