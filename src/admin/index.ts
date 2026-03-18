import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { apiDocsRoutes } from './routes/api-docs.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { domainRoutes } from './routes/domains.js';
import { eventRoutes } from './routes/events.js';
import { inboundRoutes } from './routes/inbound.js';
import { ipPoolRoutes } from './routes/ip-pools.js';
import { messageRoutes } from './routes/messages.js';
import { suppressionRoutes } from './routes/suppressions.js';
import { whatsNewRoutes } from './routes/whats-new.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const viewsRoot = path.join(projectRoot, 'src', 'views');
const publicRoot = path.join(projectRoot, 'src', 'public');

export async function adminPlugin(app: FastifyInstance) {
	await app.register(fastifyCookie);
	await app.register(fastifySession, {
		secret: env().SESSION_SECRET,
		cookie: {
			secure: env().COOKIE_SECURE,
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			path: '/admin',
		},
		saveUninitialized: false,
	});

	await app.register(fastifyCsrf, {
		sessionPlugin: '@fastify/session',
	});

	await app.register(fastifyView, {
		engine: { ejs },
		root: viewsRoot,
		defaultContext: {
			currentPath: '',
			csrfToken: '',
		},
	});

	// Generate CSRF token and inject into all views
	app.addHook('preHandler', async (_request, reply) => {
		const token = typeof reply.generateCsrf === 'function' ? reply.generateCsrf() : '';
		const origView = reply.view.bind(reply);
		// biome-ignore lint/suspicious/noExplicitAny: wrapping reply.view to inject csrfToken
		(reply as any).view = (page: string, data?: Record<string, unknown>) => {
			return origView(page, { csrfToken: token, ...data });
		};
	});

	await app.register(fastifyStatic, {
		root: publicRoot,
		prefix: '/public/',
	});

	await app.register(authRoutes);
	await app.register(dashboardRoutes);
	await app.register(domainRoutes);
	await app.register(apiKeyRoutes);
	await app.register(messageRoutes);
	await app.register(eventRoutes);
	await app.register(suppressionRoutes);
	await app.register(inboundRoutes);
	await app.register(ipPoolRoutes);
	await app.register(apiDocsRoutes);
	await app.register(whatsNewRoutes);
}
