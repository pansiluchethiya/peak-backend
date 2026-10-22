// api/src/core/response.ts
export interface SuccessEnvelope<T> {
  request_id: string;
  status: 'success';
  [key: string]: unknown;
  data?: T;
}

export function success<T extends Record<string, unknown>>(
  requestId: string,
  payload: T,
): T & { request_id: string; status: 'success' } {
  return { request_id: requestId, status: 'success', ...payload };
}

export interface ErrorEnvelope {
  request_id: string;
  status: 'error';
  error: { code: string; message: string };
}

export function failure(requestId: string, code: string, message: string): ErrorEnvelope {
  return { request_id: requestId, status: 'error', error: { code, message } };
}
