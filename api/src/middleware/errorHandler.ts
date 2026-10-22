// api/src/middleware/errorHandler.ts
import type { FastifyError, FastifyInstance } from 'fastify';
import { ApiError, statusFor, ERROR_MESSAGES } from '../core/errors.js';
import { failure } from '../core/response.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiError | Error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(failure(requestId, error.code, error.message));
    }

    const fastifyError = error as FastifyError;
    if (fastifyError?.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      const code = fastifyError.statusCode === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST';
      return reply.code(fastifyError.statusCode).send(failure(requestId, code, fastifyError.message));
    }

    request.log.error({ err: error, requestId }, 'unhandled error');
    return reply.code(500).send(failure(requestId, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(failure(request.id, 'NOT_FOUND', 'The requested resource could not be found.'));
  });
}
