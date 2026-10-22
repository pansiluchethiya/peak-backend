// api/src/core/requestId.ts
import { requestId as newRequestId } from './ulid.js';

const VALID_CLIENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(headers: Record<string, unknown>, query?: Record<string, unknown>): string {
  const candidates = [
    headers['x-request-id'],
    headers['x-client-request-id'],
    query?.request_id,
    query?.requestId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && VALID_CLIENT_ID.test(candidate)) return candidate;
  }
  return newRequestId();
}

export { newRequestId as generateRequestId };
