import { defaultVideoPreviewCacheDatabase } from './database';
import { createVideoPreviewCacheService } from './mutations';

export * from './model';
export * from './constants';
export * from './retention';
export type { VideoPreviewCacheJobToken } from './jobs';
export { VideoPreviewCacheJobInvalidatedError, createVideoPreviewCacheService } from './mutations';
export type { VideoPreviewCacheService } from './mutations';

const defaultService = createVideoPreviewCacheService({
  database: defaultVideoPreviewCacheDatabase,
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
});

export const beginVideoPreviewCacheJob = defaultService.beginJob;
export const cleanupVideoPreviewCache = defaultService.cleanup;
export const commitVideoPreviewCacheRecord = defaultService.commit;
export const deleteVideoPreviewCacheProjectRecords = defaultService.deleteProjectRecords;
export const eraseVideoPreviewCache = defaultService.erase;
export const loadVideoPreviewCacheRecord = defaultService.load;
export const touchVideoPreviewCacheRecord = defaultService.touch;
export const verifyVideoPreviewCacheEmpty = defaultService.verifyEmpty;
