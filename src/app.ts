import fastifyCors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { adminPlugin } from './admin/index.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { domainRoutes } from './routes/domains.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { messageRoutes } from './routes/messages.js';
import { suppressionRoutes } from './routes/suppressions.js';

export async function buildApp() {
	const app = Fastify({
		logger: {
			level: env().LOG_LEVEL,
			...(env().NODE_ENV === 'development' && {
				transport: { target: 'pino-pretty' },
			}),
		},
		trustProxy: true,
		bodyLimit: 2 * 1024 * 1024, // 2MB
	});

	app.setErrorHandler(errorHandler);

	await app.register(helmet, {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:'],
			},
		},
		frameguard: { action: 'deny' },
		referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
	});

	const corsOrigins = env().CORS_ORIGINS;
	await app.register(fastifyCors, {
		origin: corsOrigins === '*' ? true : corsOrigins.split(',').map((s) => s.trim()),
		credentials: corsOrigins !== '*',
	});

	await app.register(fastifyFormbody);

	await app.register(rateLimit, {
		max: env().RATE_LIMIT_MAX,
		timeWindow: '1 minute',
	});

	// Unprotected routes
	await app.register(healthRoutes);

	// Internal routes (called by Postfix log watcher within Docker network)
	await app.register(internalRoutes, { prefix: '/internal' });

	// Admin UI
	await app.register(adminPlugin, { prefix: '/admin' });

	// API v1 routes
	await app.register(
		async (v1) => {
			await v1.register(apiKeyRoutes);
			await v1.register(domainRoutes);
			await v1.register(messageRoutes);
			await v1.register(eventRoutes);
			await v1.register(suppressionRoutes);
		},
		{ prefix: '/v1' },
	);

	return app;
}
