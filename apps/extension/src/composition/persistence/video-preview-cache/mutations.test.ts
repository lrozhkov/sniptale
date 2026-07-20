import { beforeEach, describe, expect, it } from 'vitest';

import type {
  VideoPreviewCacheDatabasePort,
  VideoPreviewCacheReadTransaction,
  VideoPreviewCacheTransaction,
} from './database';
import type { VideoPreviewCacheRecord, VideoPreviewCacheSegment } from './model';
import { VIDEO_PREVIEW_CACHE_MAX_AGE_MS } from './constants';
import { VideoPreviewCacheJobInvalidatedError, createVideoPreviewCacheService } from './mutations';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;

class MemoryPreviewCacheDatabase implements VideoPreviewCacheDatabasePort {
  instanceExists = false;
  metadata = new Map<string, unknown>();
  mutationCount = 0;
  records = new Map<string, unknown>();

  async close(): Promise<void> {}

  async deleteDatabase(): Promise<void> {
    this.instanceExists = false;
    this.metadata.clear();
    this.records.clear();
  }

  async mutateExisting<T>(
    operation: (tx: VideoPreviewCacheTransaction) => Promise<T>
  ): Promise<T | null> {
    if (!this.instanceExists) return null;
    this.mutationCount += 1;
    return operation(this.createTransaction());
  }

  async mutateOrCreate<T>(operation: (tx: VideoPreviewCacheTransaction) => Promise<T>): Promise<T> {
    this.instanceExists = true;
    this.mutationCount += 1;
    return operation(this.createTransaction());
  }

  async readExisting<T>(
    operation: (tx: VideoPreviewCacheReadTransaction) => Promise<T>
  ): Promise<T | null> {
    return this.instanceExists ? operation(this.createTransaction()) : null;
  }

  async verifyAbsent(): Promise<boolean> {
    return !this.instanceExists;
  }

  private createTransaction(): VideoPreviewCacheTransaction {
    return {
      deleteRecord: async (key) => void this.records.delete(key),
      getMetadata: async (key) => this.metadata.get(key),
      getRecord: async (key) => this.records.get(key),
      listRecordEntries: async () => [...this.records].map(([key, value]) => ({ key, value })),
      putMetadata: async (key, value) => void this.metadata.set(key, value),
      putRecord: async (key, value) => void this.records.set(key, value),
    };
  }
}

function segment(index: number, fingerprint = DIGEST_B): VideoPreviewCacheSegment {
  return {
    blob: new Blob([`segment-${index}`], { type: 'video/mp4' }),
    endFrame: (index + 1) * 60,
    fingerprint,
    index,
    startFrame: index * 60,
  };
}

function record(overrides: Partial<VideoPreviewCacheRecord> = {}): VideoPreviewCacheRecord {
  return {
    byteLength: 0,
    codec: 'avc1.42E01E',
    contentRevision: DIGEST_A,
    createdAt: 100,
    fps: 30,
    height: 1440,
    lastAccessedAt: 100,
    mimeType: 'video/mp4',
    projectId: 'project-1',
    range: { endFrame: 180, startFrame: 0 },
    schemaVersion: 2,
    segments: [segment(0)],
    storageKey: DIGEST_A,
    width: 2560,
    ...overrides,
  };
}

let database: MemoryPreviewCacheDatabase;
let now: number;
let randomId = 0;

beforeEach(() => {
  database = new MemoryPreviewCacheDatabase();
  now = 1_000;
  randomId = 0;
});

function createService() {
  return createVideoPreviewCacheService({
    database,
    now: () => now,
    randomUUID: () => `00000000-0000-4000-8000-${String(++randomId).padStart(12, '0')}`,
  });
}

describe('video preview cache mutation jobs', () => {
  it('rejects a stale job token after erasure and database recreation', async () => {
    const service = createService();
    const staleJob = await service.beginJob();
    await service.erase();
    await service.beginJob();

    await expect(service.commit(staleJob, record())).rejects.toBeInstanceOf(
      VideoPreviewCacheJobInvalidatedError
    );
    await expect(service.load(DIGEST_A)).resolves.toBeNull();
  });

  it('rejects an in-flight commit after project cache deletion rotates the job epoch', async () => {
    const service = createService();
    const staleJob = await service.beginJob();

    await expect(service.deleteProjectRecords('project-1')).resolves.toEqual({ removedCount: 0 });
    await expect(service.commit(staleJob, record())).rejects.toBeInstanceOf(
      VideoPreviewCacheJobInvalidatedError
    );
    await expect(service.load(DIGEST_A)).resolves.toBeNull();
  });
});

describe('video preview cache mutation reads and merges', () => {
  it('keeps load read-only and updates access time only through touch', async () => {
    const service = createService();
    const job = await service.beginJob();
    await service.commit(job, record());
    const mutationsAfterCommit = database.mutationCount;

    await expect(service.load(DIGEST_A)).resolves.toEqual(
      expect.objectContaining({ lastAccessedAt: 1_000 })
    );
    expect(database.mutationCount).toBe(mutationsAfterCommit);

    now = 2_000;
    await expect(service.touch(DIGEST_A)).resolves.toBe(true);
    await expect(service.load(DIGEST_A)).resolves.toEqual(
      expect.objectContaining({ lastAccessedAt: 2_000 })
    );
  });

  it('merges concurrent same-revision complete-record commits without losing segments', async () => {
    const service = createService();
    const job = await service.beginJob();

    await Promise.all([
      service.commit(job, record({ segments: [segment(0)] })),
      service.commit(job, record({ segments: [segment(1, DIGEST_C)] })),
    ]);

    await expect(service.load(DIGEST_A)).resolves.toEqual(
      expect.objectContaining({
        segments: [expect.objectContaining({ index: 0 }), expect.objectContaining({ index: 1 })],
      })
    );
  });
});

describe('video preview cache cleanup and project deletion', () => {
  it('keeps absent-database maintenance and reads non-creating', async () => {
    const service = createService();

    await expect(service.cleanup()).resolves.toEqual({ removedCount: 0 });
    await expect(service.load(DIGEST_A)).resolves.toBeNull();
    await expect(service.touch(DIGEST_A)).resolves.toBe(false);
    await expect(service.deleteProjectRecords('project-1')).resolves.toEqual({ removedCount: 0 });
    expect(database.instanceExists).toBe(false);
  });

  it('removes malformed and expired rows only through explicit cleanup', async () => {
    const service = createService();
    const job = await service.beginJob();
    await service.commit(job, record());
    database.records.set(DIGEST_B, { projectId: 'project-invalid' });
    now = 1_000 + VIDEO_PREVIEW_CACHE_MAX_AGE_MS;

    await expect(service.cleanup()).resolves.toEqual({ removedCount: 2 });
    expect(database.records.size).toBe(0);
  });

  it('deletes and verifies all valid or malformed rows for one project', async () => {
    const service = createService();
    const job = await service.beginJob();
    await service.commit(job, record());
    database.records.set(DIGEST_B, { projectId: 'project-1', segments: 'invalid' });
    database.records.set(DIGEST_C, { projectId: 'project-2', segments: 'invalid' });

    await expect(service.deleteProjectRecords('project-1')).resolves.toEqual({ removedCount: 2 });
    expect(database.records.has(DIGEST_C)).toBe(true);
  });
});
