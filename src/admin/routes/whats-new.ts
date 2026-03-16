import type { FastifyInstance } from 'fastify';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

export async function whatsNewRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/whats-new', async (request, reply) => {
		const flash = getFlash(request);
		return reply.view('whats-new.ejs', {
			currentPath: '/whats-new',
			flash,
		});
	});
}
