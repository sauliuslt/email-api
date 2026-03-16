import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
	interface Session {
		authenticated?: boolean;
		flash?: { type: 'success' | 'error' | 'info'; message: string };
		newKey?: string;
	}
}

export function getFlash(request: FastifyRequest): { type: string; message: string } | null {
	const flash = request.session.get('flash') ?? null;
	if (flash) {
		request.session.set('flash', undefined);
	}
	return flash;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
	if (!request.session.get('authenticated')) {
		return reply.redirect('/admin/login');
	}
}
