// api/src/resolvers/musicResolver.ts
import { ApiError } from '../core/errors.js';
import type { Resolver, ResolverInput, ResolvedMedia } from './types.js';
export class MusicResolver implements Resolver {
  async resolve(_input: ResolverInput): Promise<ResolvedMedia> {
    throw new ApiError('NOT_IMPLEMENTED', 'Music streaming is not implemented yet.', 501);
  }
}
