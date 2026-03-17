import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const baseEnv = {
	PORT: '3000',
	HOST: '0.0.0.0',
	NODE_ENV: 'development',
	LOG_LEVEL: 'info',
	DATABASE_URL: 'mysql://user:pass@localhost:3306/emailapi',
	REDIS_URL: 'redis://localhost:6379',
	SMTP_HOST: 'localhost',
	SMTP_PORT: '25',
	SMTP_TLS: 'false',
	SPAMD_HOST: 'localhost',
	SPAMD_PORT: '783',
	SPAM_SCORE_THRESHOLD: '5',
	API_URL: 'http://localhost:3000',
	MASTER_API_KEY: 'test-master-key',
	INTERNAL_API_SECRET: '0123456789abcdef',
	CORS_ORIGINS: '*',
	RATE_LIMIT_MAX: '100',
	RATE_LIMIT_SEND_MAX: '30',
	POSTFIX_CONFIG_DIR: './config/postfix',
	ADMIN_PASSWORD: 'password123',
	SESSION_SECRET: '0123456789abcdef0123456789abcdef',
} satisfies NodeJS.ProcessEnv;

describe('parseEnv', () => {
	it('defaults COOKIE_SECURE to false outside production', () => {
		const env = parseEnv(baseEnv);

		expect(env.COOKIE_SECURE).toBe(false);
	});

	it('defaults COOKIE_SECURE to auto in production', () => {
		const env = parseEnv({ ...baseEnv, NODE_ENV: 'production' });

		expect(env.COOKIE_SECURE).toBe('auto');
	});

	it('accepts explicit COOKIE_SECURE values', () => {
		expect(parseEnv({ ...baseEnv, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
		expect(parseEnv({ ...baseEnv, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
		expect(parseEnv({ ...baseEnv, COOKIE_SECURE: 'auto' }).COOKIE_SECURE).toBe('auto');
	});

	it('uses MYSQL_* credentials over DATABASE_URL credentials when both are set', () => {
		const env = parseEnv({
			...baseEnv,
			DATABASE_URL: 'mysql://wrong:wrong@email-mysql:3306/wrongdb',
			MYSQL_ROOT_PASSWORD: 'emailapi',
			MYSQL_DATABASE: 'emailapi',
		});

		expect(env.DATABASE_URL).toBe('mysql://root:emailapi@email-mysql:3306/emailapi');
	});
});
