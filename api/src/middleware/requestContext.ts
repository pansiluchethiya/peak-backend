// api/src/middleware/requestContext.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveRequestId } from '../core/requestId.js';

export function registerRequestContext(app: FastifyInstance): void {
  app.setGenReqId((request) => {
    const headers = (request.headers ?? {}) as Record<string, unknown>;
    const query = ((request as { query?: unknown }).query ?? {}) as Record<string, unknown>;
    return resolveRequestId(headers, query);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const contentType = reply.getHeader('content-type');
    if (typeof contentType === 'string' && contentType.includes('application/json') && typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !('request_id' in parsed)) {
          parsed.request_id = request.id;
          return JSON.stringify(parsed);
        }
      } catch {
        // Not JSON or already streamed; leave payload untouched.
      }
    }
    return payload;
  });
}
