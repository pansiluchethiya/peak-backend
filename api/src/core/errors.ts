// api/src/core/errors.ts
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_ID'
  | 'INVALID_SEASON'
  | 'INVALID_EPISODE'
  | 'MEDIA_NOT_FOUND'
  | 'EPISODE_NOT_FOUND'
  | 'CHANNEL_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_UNAVAILABLE'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_IMPLEMENTED';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, statusCode?: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode ?? statusFor(code);
    this.details = details;
  }
}

export function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'INVALID_REQUEST':
    case 'INVALID_ID':
    case 'INVALID_SEASON':
    case 'INVALID_EPISODE':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'MEDIA_NOT_FOUND':
    case 'EPISODE_NOT_FOUND':
    case 'CHANNEL_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;
    case 'PROVIDER_TIMEOUT':
      return 504;
    case 'RATE_LIMITED':
      return 429;
    case 'SOURCE_UNAVAILABLE':
      return 503;
    case 'PROVIDER_ERROR':
      return 502;
    case 'INTERNAL_ERROR':
    case 'NOT_IMPLEMENTED':
    default:
      return 500;
  }
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: 'The request is invalid.',
  INVALID_ID: 'The provided id is invalid.',
  INVALID_SEASON: 'The provided season is invalid.',
  INVALID_EPISODE: 'The provided episode is invalid.',
  MEDIA_NOT_FOUND: 'The requested media could not be found.',
  EPISODE_NOT_FOUND: 'The requested episode could not be found.',
  CHANNEL_NOT_FOUND: 'The requested channel could not be found.',
  SOURCE_NOT_FOUND: 'The requested source could not be found.',
  SOURCE_UNAVAILABLE: 'The requested source is unavailable.',
  PROVIDER_ERROR: 'An upstream provider error occurred.',
  PROVIDER_TIMEOUT: 'An upstream provider timed out.',
  RATE_LIMITED: 'Too many requests; try again later.',
  INTERNAL_ERROR: 'An internal error occurred.',
  UNAUTHORIZED: 'Authentication is required.',
  FORBIDDEN: 'Access is forbidden.',
  NOT_FOUND: 'The requested resource could not be found.',
  NOT_IMPLEMENTED: 'This endpoint is not implemented yet.',
};
