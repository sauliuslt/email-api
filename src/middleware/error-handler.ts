import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(
	error: FastifyError,
	_request: FastifyRequest,
	reply: FastifyReply,
): void {
	const statusCode = error.statusCode ?? 500;

	if (statusCode >= 500) {
		_request.log.error(error);
	}

	reply.code(statusCode).send({
		error: statusCode >= 500 ? 'Internal Server Error' : error.message,
		...(error.validation && { details: error.validation }),
	});
}
