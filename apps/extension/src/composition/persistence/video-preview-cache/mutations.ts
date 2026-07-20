import {
  runWithPersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
} from '../infrastructure/mutation-barrier';
import type { VideoPreviewCacheDatabasePort } from './database';
import {
  beginVideoPreviewCacheJob,
  hasCurrentVideoPreviewCacheInstance,
  invalidateVideoPreviewCacheJobs,
  isVideoPreviewCacheJobToken,
  type VideoPreviewCacheJobToken,
} from './jobs';
import {
  parseVideoPreviewCacheRecord,
  readVideoPreviewCacheProjectId,
  type VideoPreviewCacheRecord,
} from './model';
import {
  createCommittedVideoPreviewRecord,
  deleteVideoPreviewRecordKeys,
  parseVideoPreviewCacheEntry,
  validateVideoPreviewStorageKey,
} from './record-mutations';
import { selectVideoPreviewCacheEvictions } from './retention';

export class VideoPreviewCacheJobInvalidatedError extends Error {
  constructor() {
    super('Video preview cache job was invalidated');
    this.name = 'VideoPreviewCacheJobInvalidatedError';
  }
}

export interface VideoPreviewCacheService {
  beginJob(): Promise<VideoPreviewCacheJobToken>;
  cleanup(): Promise<{ removedCount: number }>;
  commit(
    token: VideoPreviewCacheJobToken,
    record: VideoPreviewCacheRecord
  ): Promise<VideoPreviewCacheRecord>;
  deleteProjectRecords(projectId: string): Promise<{ removedCount: number }>;
  erase(): Promise<void>;
  load(storageKey: string): Promise<VideoPreviewCacheRecord | null>;
  touch(storageKey: string): Promise<boolean>;
  verifyEmpty(): Promise<boolean>;
}

interface VideoPreviewCacheServiceDeps {
  database: VideoPreviewCacheDatabasePort;
  now(): number;
  randomUUID(): string;
}

function validateNow(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('Video preview cache clock is invalid');
  return now;
}

async function cleanupCache(deps: VideoPreviewCacheServiceDeps) {
  return runWithPersistenceMutationPermit(async () => {
    const result = await deps.database.mutateExisting(async (transaction) => {
      const entries = await transaction.listRecordEntries();
      const records = entries.map(parseVideoPreviewCacheEntry).filter((record) => record !== null);
      const invalidKeys = entries
        .filter((entry) => !parseVideoPreviewCacheEntry(entry))
        .map((entry) => entry.key);
      const evictionKeys = selectVideoPreviewCacheEvictions(records, validateNow(deps.now()));
      const keys = new Set([...invalidKeys, ...evictionKeys]);
      const removedCount = await deleteVideoPreviewRecordKeys(
        entries,
        keys,
        transaction.deleteRecord
      );
      return { removedCount };
    });
    return result ?? { removedCount: 0 };
  });
}

async function commitCache(
  deps: VideoPreviewCacheServiceDeps,
  token: VideoPreviewCacheJobToken,
  input: VideoPreviewCacheRecord
) {
  if (!isVideoPreviewCacheJobToken(token)) throw new VideoPreviewCacheJobInvalidatedError();
  const incoming = parseVideoPreviewCacheRecord(input);
  if (!incoming) throw new Error('Invalid video preview cache record');
  return runWithPersistenceMutationPermit(async () => {
    const result = await deps.database.mutateExisting(async (transaction) => {
      if (!(await hasCurrentVideoPreviewCacheInstance(transaction, token))) {
        throw new VideoPreviewCacheJobInvalidatedError();
      }
      const entries = await transaction.listRecordEntries();
      const currentEntry = entries.find((entry) => entry.key === incoming.storageKey);
      const current = currentEntry ? parseVideoPreviewCacheEntry(currentEntry) : null;
      const now = validateNow(deps.now());
      const committed = createCommittedVideoPreviewRecord(current, incoming, now);
      const records = entries
        .filter((entry) => entry.key !== committed.storageKey)
        .map(parseVideoPreviewCacheEntry)
        .filter((record) => record !== null);
      records.push(committed);
      const evictions = new Set(
        selectVideoPreviewCacheEvictions(records, now, committed.storageKey)
      );
      for (const storageKey of evictions) await transaction.deleteRecord(storageKey);
      await transaction.putRecord(committed.storageKey, committed);
      return committed;
    });
    if (!result) throw new VideoPreviewCacheJobInvalidatedError();
    return result;
  });
}

async function deleteProjectCache(deps: VideoPreviewCacheServiceDeps, projectId: string) {
  if (projectId.length === 0 || projectId.length > 512) throw new Error('Invalid project ID');
  return runWithPersistenceMutationPermit(async () => {
    const result = await deps.database.mutateExisting(async (transaction) => {
      await invalidateVideoPreviewCacheJobs(transaction, deps.randomUUID);
      const entries = await transaction.listRecordEntries();
      const keys = new Set(
        entries
          .filter((entry) => readVideoPreviewCacheProjectId(entry.value) === projectId)
          .map((entry) => entry.key)
      );
      const removedCount = await deleteVideoPreviewRecordKeys(
        entries,
        keys,
        transaction.deleteRecord
      );
      const remaining = await transaction.listRecordEntries();
      if (remaining.some((entry) => readVideoPreviewCacheProjectId(entry.value) === projectId)) {
        throw new Error('Video preview cache project deletion verification failed');
      }
      return { removedCount };
    });
    return result ?? { removedCount: 0 };
  });
}

async function eraseCache(deps: VideoPreviewCacheServiceDeps): Promise<void> {
  await runWithPersistentDataErasureBarrier(async () => {
    await deps.database.close();
    await deps.database.deleteDatabase();
    if (!(await deps.database.verifyAbsent())) {
      throw new Error('Video preview cache erasure verification failed');
    }
  });
}

async function loadCache(deps: VideoPreviewCacheServiceDeps, storageKey: string) {
  validateVideoPreviewStorageKey(storageKey);
  const result = await deps.database.readExisting(async (transaction) => {
    const parsed = parseVideoPreviewCacheRecord(await transaction.getRecord(storageKey));
    return parsed?.storageKey === storageKey ? parsed : null;
  });
  return result ?? null;
}

async function touchCache(deps: VideoPreviewCacheServiceDeps, storageKey: string) {
  validateVideoPreviewStorageKey(storageKey);
  return runWithPersistenceMutationPermit(async () => {
    const result = await deps.database.mutateExisting(async (transaction) => {
      const current = parseVideoPreviewCacheRecord(await transaction.getRecord(storageKey));
      if (!current || current.storageKey !== storageKey) return false;
      const touched = parseVideoPreviewCacheRecord({
        ...current,
        lastAccessedAt: validateNow(deps.now()),
      });
      if (!touched) return false;
      await transaction.putRecord(storageKey, touched);
      return true;
    });
    return result ?? false;
  });
}

export function createVideoPreviewCacheService(
  deps: VideoPreviewCacheServiceDeps
): VideoPreviewCacheService {
  return {
    beginJob: () => beginVideoPreviewCacheJob(deps),
    cleanup: () => cleanupCache(deps),
    commit: (token, record) => commitCache(deps, token, record),
    deleteProjectRecords: (projectId) => deleteProjectCache(deps, projectId),
    erase: () => eraseCache(deps),
    load: (storageKey) => loadCache(deps, storageKey),
    touch: (storageKey) => touchCache(deps, storageKey),
    verifyEmpty: () => deps.database.verifyAbsent(),
  };
}
