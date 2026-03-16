import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getFlash } from '../middleware/admin-auth.js';

export async function authRoutes(app: FastifyInstance) {
	const config = env();

	if (config.ADMIN_PASSWORD && !config.ADMIN_PASSWORD_HASH) {
		app.log.warn(
			'ADMIN_PASSWORD is set without ADMIN_PASSWORD_HASH. Consider migrating to ADMIN_PASSWORD_HASH with bcrypt for stronger security.',
		);
	}

	app.get('/login', async (request, reply) => {
		if (request.session.get('authenticated')) {
			return reply.redirect('/admin');
		}
		const flash = getFlash(request);
		return reply.view('auth/login.ejs', { flash, currentPath: '/login' });
	});

	app.post<{ Body: { password: string } }>(
		'/login',
		{
			config: {
				rateLimit: {
					max: 5,
					timeWindow: 60000,
				},
			},
		},
		async (request, reply) => {
			const { password } = request.body;

			if (!password || !(await isPasswordValid(password))) {
				request.session.set('flash', {
					type: 'error',
					message: 'Invalid password',
				});
				return reply.redirect('/admin/login');
			}

			await request.session.regenerate();
			request.session.set('authenticated', true);
			return reply.redirect('/admin');
		},
	);

	app.post('/logout', async (request, reply) => {
		await request.session.destroy();
		return reply.redirect('/admin/login');
	});
}

async function isPasswordValid(password: string): Promise<boolean> {
	const config = env();

	// Prefer bcrypt hash if available
	if (config.ADMIN_PASSWORD_HASH) {
		return bcrypt.compare(password, config.ADMIN_PASSWORD_HASH);
	}

	// Fallback to SHA-256 timing-safe comparison with plain password
	if (config.ADMIN_PASSWORD) {
		const a = createHash('sha256').update(password).digest();
		const b = createHash('sha256').update(config.ADMIN_PASSWORD).digest();
		return timingSafeEqual(a, b);
	}

	return false;
}
