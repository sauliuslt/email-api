import type { FastifyInstance } from 'fastify';
import { getFlash, requireAdmin } from '../middleware/admin-auth.js';

export async function apiDocsRoutes(app: FastifyInstance) {
	app.addHook('onRequest', requireAdmin);

	app.get('/api-docs', async (request, reply) => {
		const flash = getFlash(request);
		return reply.view('api-docs.ejs', {
			currentPath: '/api-docs',
			flash,
			apiUrl: `${request.protocol}://${request.hostname}`,
		});
	});
}
