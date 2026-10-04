import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
} from '../infrastructure/indexed-db/core.stores';

const mocks = vi.hoisted(() => ({
  collectOrphans: vi.fn(async () => undefined),
  collectQuiescent: vi.fn(async () => 0),
  deleteAssetObject: vi.fn(async () => undefined),
  deleteReadyJournal: vi.fn(async () => undefined),
  inspect: vi.fn(),
  listReadyJournals: vi.fn(async (): Promise<AssetReadyJournal[]> => []),
  openDB: vi.fn(),
}));

vi.mock('idb', () => ({ openDB: mocks.openDB }));

vi.mock('../infrastructure/indexed-db/admission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/admission')>()),
  inspectDatabaseAdmission: mocks.inspect,
}));

vi.mock('../asset-publication-recovery/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../asset-publication-recovery/audit')>()),
  collectOrphanAssetObjects: mocks.collectOrphans,
}));

import type { AssetReadyJournal } from './contracts';
import type { PersistenceLockManager } from '../infrastructure/mutation-barrier';

const TRANSITION_LOCK = 'sniptale:persistence:privacy-erasure:transition';
const PERSISTENCE_LOCK = 'sniptale:persistence:privacy-erasure';
const DURABLE_ASSET_LOCK = 'sniptale:persistence:privacy-erasure:durable-assets';
const DURABLE_ASSET_OPERATION_LOCK =
  'sniptale:persistence:privacy-erasure:durable-asset-operations';

interface LockRequestRecord {
  held: string[];
  mode: 'exclusive' | 'shared';
  name: string;
}

interface PendingLock {
  mode: 'exclusive' | 'shared';
  operation: () => unknown | Promise<unknown>;
  reject(error: unknown): void;
  resolve(value: unknown): void;
}

interface LockState {
  activeExclusive: boolean;
  activeShared: number;
  pending: PendingLock[];
}

async function runPendingLock(lock: PendingLock): Promise<void> {
  try {
    lock.resolve(await lock.operation());
  } catch (error) {
    lock.reject(error);
  }
}

function drainLock(state: LockState): void {
  if (state.activeExclusive || state.pending.length === 0) return;
  const first = state.pending[0]!;
  if (first.mode === 'exclusive') {
    if (state.activeShared > 0) return;
    state.pending.shift();
    state.activeExclusive = true;
    void runPendingLock(first).finally(() => {
      state.activeExclusive = false;
      drainLock(state);
    });
    return;
  }
  while (state.pending[0]?.mode === 'shared' && !state.activeExclusive) {
    const next = state.pending.shift()!;
    state.activeShared += 1;
    void runPendingLock(next).finally(() => {
      state.activeShared -= 1;
      drainLock(state);
    });
  }
}

/**
 * Web Locks FIFO semantics plus a held-chain trace. Two transition-lock orderings are
 * unrecoverable: re-requesting the transition lock while the chain already holds it waits
 * on the chain's own hold, and requesting the exclusive transition gate while holding any
 * other persistence lock inverts the gate's outermost position so its inner exclusive
 * persistence request can cycle against contexts waiting on our held lock.
 */
function createRecordingLockManager() {
  const held: string[] = [];
  const locks = new Map<string, LockState>();
  const requests: LockRequestRecord[] = [];

  function getLockState(name: string): LockState {
    const existing = locks.get(name);
    if (existing) return existing;
    const state: LockState = { activeExclusive: false, activeShared: 0, pending: [] };
    locks.set(name, state);
    return state;
  }

  const manager: PersistenceLockManager = {
    request<T>(
      name: string,
      options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ) {
      requests.push({ held: [...held], mode: options.mode, name });
      return new Promise<T>((resolve, reject) => {
        getLockState(name).pending.push({
          mode: options.mode,
          operation: async () => {
            held.push(name);
            try {
              return await operation();
            } finally {
              held.pop();
            }
          },
          reject,
          resolve: resolve as (value: unknown) => void,
        });
        drainLock(getLockState(name));
      });
    },
  };

  return { manager, requests };
}

function createDatabase() {
  const objectStoreNames = [...EXPECTED_STORES] as string[] & {
    contains(name: string): boolean;
  };
  objectStoreNames.contains = (name) => objectStoreNames.includes(name);
  return {
    close: vi.fn(),
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async () => []),
    objectStoreNames,
    transaction: vi.fn((storeName: string) => ({
      objectStore: vi.fn(() => ({
        indexNames: EXPECTED_INDEXES[storeName as keyof typeof EXPECTED_INDEXES] ?? [],
        openCursor: vi.fn(async () => null),
      })),
      done: Promise.resolve(),
    })),
  };
}

function notFound(): Error {
  return Object.assign(new Error('missing'), { name: 'NotFoundError' });
}

class MemoryFileHandle {
  readonly kind = 'file' as const;
  private bytes = new Blob();

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let bytes = new Uint8Array(0);
    let position = 0;
    return {
      abort: async () => undefined,
      close: async () => {
        this.bytes = new Blob([bytes]);
      },
      seek: async (offset: number) => {
        position = offset;
      },
      write: async (value: FileSystemWriteChunkType) => {
        let data: BlobPart;
        if (
          typeof value === 'object' &&
          value !== null &&
          !(value instanceof Blob) &&
          'type' in value
        ) {
          if (value.type !== 'write' || value.data == null)
            throw new Error('Unsupported write command.');
          position = value.position ?? position;
          data = value.data;
        } else data = value;
        const chunk = new Uint8Array(await new Blob([data]).arrayBuffer());
        const next = new Uint8Array(Math.max(bytes.length, position + chunk.length));
        next.set(bytes);
        next.set(chunk, position);
        bytes = next;
        position += chunk.length;
      },
    } as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], 'memory-file');
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly entriesByName = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    const current = this.entriesByName.get(name);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    if (current instanceof MemoryDirectoryHandle)
      return current as unknown as FileSystemDirectoryHandle;
    if (current || !options?.create) throw notFound();
    const directory = new MemoryDirectoryHandle();
    this.entriesByName.set(name, directory);
    return directory as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const current = this.entriesByName.get(name);
    if (current instanceof MemoryFileHandle) return current as unknown as FileSystemFileHandle;
    if (current || !options?.create) throw notFound();
    const file = new MemoryFileHandle();
    this.entriesByName.set(name, file);
    return file as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entriesByName.delete(name)) throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, handle] of this.entriesByName) {
      yield [name, handle as unknown as FileSystemHandle];
    }
  }
}

function createJournal(overrides: Partial<AssetReadyJournal> = {}): AssetReadyJournal {
  return {
    assetRefs: [
      {
        assetId: 'asset-1',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/asset-1' },
        mimeType: 'image/png',
        sha256: null,
        size: 5,
      },
    ],
    createdAt: 1,
    domain: 'image-workspace',
    journalId: 'journal-1',
    payload: {},
    ...overrides,
  };
}

function transitionOrderingViolations(requests: readonly LockRequestRecord[]) {
  return requests.filter(
    (request) =>
      request.name === TRANSITION_LOCK &&
      (request.held.includes(TRANSITION_LOCK) ||
        (request.mode === 'exclusive' && request.held.length > 0))
  );
}

async function importFreshModules() {
  vi.resetModules();
  const barrier = await import('../infrastructure/mutation-barrier');
  const core = await import('../infrastructure/indexed-db/core');
  const opfsStore = await import('./opfs-store');
  vi.spyOn(opfsStore, 'listReadyJournals').mockImplementation(mocks.listReadyJournals);
  vi.spyOn(opfsStore, 'deleteReadyJournal').mockImplementation(mocks.deleteReadyJournal);
  vi.spyOn(opfsStore, 'collectQuiescentWritingObjects').mockImplementation(mocks.collectQuiescent);
  const publication = await import('./publication');
  const recovery = await import('./recovery');
  const publicationRecovery = await import('../asset-publication-recovery');
  return { barrier, core, opfsStore, publication, publicationRecovery, recovery };
}

let recorder: ReturnType<typeof createRecordingLockManager>;

beforeEach(() => {
  vi.clearAllMocks();
  recorder = createRecordingLockManager();
  mocks.openDB.mockResolvedValue(createDatabase());
  mocks.inspect.mockResolvedValue({ databaseVersion: DB_VERSION, status: 'ready' });
});

afterEach(async () => {
  await installPersistenceLockManagerForTests(null);
});

function installPersistenceLockManagerForTests(manager: PersistenceLockManager | null) {
  return import('../infrastructure/mutation-barrier').then((barrier) =>
    barrier.installPersistenceLockManagerForTests(manager)
  );
}

it('admits a cold database before holding the shared transition gate during standalone recovery', async () => {
  const journal = createJournal();
  mocks.listReadyJournals.mockResolvedValue([journal]);
  const { barrier, core, recovery } = await importFreshModules();
  barrier.installPersistenceLockManagerForTests(recorder.manager);
  const publish = vi.fn(async () => {
    await core.initDB();
  });

  const recovered = recovery.recoverStandaloneAssetPublications([
    { domain: 'image-workspace', publish },
  ]);
  const outcome = await Promise.race([
    recovered.then(
      () => 'settled' as const,
      () => 'settled' as const
    ),
    vi
      .waitFor(
        () => {
          expect(transitionOrderingViolations(recorder.requests).length).toBeGreaterThan(0);
        },
        { interval: 20, timeout: 2_000 }
      )
      .then(() => 'deadlocked' as const),
  ]);
  expect(outcome).toBe('settled');
  await expect(recovered).resolves.toBe(1);

  expect(publish).toHaveBeenCalledOnce();
  expect(transitionOrderingViolations(recorder.requests)).toEqual([]);
  const transitionModes = recorder.requests
    .filter((request) => request.name === TRANSITION_LOCK)
    .map((request) => request.mode);
  expect(transitionModes).toEqual(['exclusive', 'shared']);
}, 15_000);

it('keeps the transition gate outermost across full startup publication recovery', async () => {
  mocks.listReadyJournals.mockResolvedValue([createJournal({ domain: 'unregistered' })]);
  const { barrier, publicationRecovery } = await importFreshModules();
  barrier.installPersistenceLockManagerForTests(recorder.manager);

  await expect(publicationRecovery.recoverAssetPublications()).resolves.toBe(0);

  expect(transitionOrderingViolations(recorder.requests)).toEqual([]);
  const requestOrder = recorder.requests.map(({ mode, name }) => `${name}:${mode}`);
  expect(requestOrder).toEqual([
    `${TRANSITION_LOCK}:exclusive`,
    `${PERSISTENCE_LOCK}:exclusive`,
    `${PERSISTENCE_LOCK}:shared`,
    `${DURABLE_ASSET_OPERATION_LOCK}:exclusive`,
    `${DURABLE_ASSET_LOCK}:exclusive`,
    `${PERSISTENCE_LOCK}:shared`,
    `${PERSISTENCE_LOCK}:shared`,
    `${PERSISTENCE_LOCK}:shared`,
    `${TRANSITION_LOCK}:shared`,
    `${DURABLE_ASSET_LOCK}:exclusive`,
  ]);
});

it('rejects interrupted publication, releases its lease and permits fresh admission', async () => {
  const { barrier, core, opfsStore, publication } = await importFreshModules();
  barrier.installPersistenceLockManagerForTests(recorder.manager);
  const root = new MemoryDirectoryHandle();
  const options = {
    getOriginRoot: async () => root as unknown as FileSystemDirectoryHandle,
    requestExclusiveLock: async (
      _name: string,
      _lockOptions: { ifAvailable: boolean },
      callback: (acquired: boolean) => Promise<void>
    ) => callback(true),
  };

  // Warm admission captures the connection's blocking callback for the real
  // mid-staging invalidation trigger below.
  await core.initDB();
  const openOptions = mocks.openDB.mock.calls[0]?.[2] as { blocking?: () => void };
  expect(typeof openOptions.blocking).toBe('function');

  // A staged writer registers its shared transition lease under the journal's
  // asset id and keeps it until publication releases it.
  await opfsStore.writeBlobToAsset(new Blob(['staged-bytes']), {
    ...options,
    assetId: 'asset-1',
  });
  const transitionModesBeforeInvalidation = recorder.requests
    .filter((request) => request.name === TRANSITION_LOCK)
    .map((request) => request.mode);
  expect(transitionModesBeforeInvalidation).toEqual(['exclusive', 'shared']);

  // The blocking callback is the real databaseReady=false trigger: a foreign
  // connection requested an upgrade, so this tab closed its handle.
  openOptions.blocking?.();

  const publish = vi.fn(async () => undefined);
  const published = publication.publishReadyJournalWithRetry(createJournal(), publish);
  const outcome = await Promise.race([
    published.then(
      () => 'settled' as const,
      () => 'settled' as const
    ),
    vi
      .waitFor(
        () => {
          expect(transitionOrderingViolations(recorder.requests).length).toBeGreaterThan(0);
        },
        { interval: 20, timeout: 2_000 }
      )
      .then(() => 'deadlocked' as const),
  ]);
  expect(outcome).toBe('settled');
  await expect(published).rejects.toMatchObject({
    admission: { reason: 'connection-blocked', status: 'blocked' },
  });

  expect(publish).not.toHaveBeenCalled();
  expect(transitionOrderingViolations(recorder.requests)).toEqual([]);

  // The publication released the staged lease: a queued exclusive transition
  // request grants immediately instead of waiting on a leaked shared hold.
  const releasedAdmission = vi.fn(async () => undefined);
  await barrier.runWithPersistentDataErasureBarrier(releasedAdmission);
  expect(releasedAdmission).toHaveBeenCalledOnce();
  await expect(core.initDB()).resolves.toBeDefined();
});

it('lets a queued cold-start admission settle once standalone recovery releases the gate', async () => {
  const journal = createJournal();
  mocks.listReadyJournals.mockResolvedValue([journal]);
  const { barrier, recovery } = await importFreshModules();
  barrier.installPersistenceLockManagerForTests(recorder.manager);
  let releasePublish!: () => void;
  const publishReleased = new Promise<void>((resolve) => {
    releasePublish = resolve;
  });
  const publish = vi.fn(async () => {
    await publishReleased;
  });
  const recovered = recovery.recoverStandaloneAssetPublications([
    { domain: 'image-workspace', publish },
  ]);
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
  const admission = vi.fn(async () => undefined);
  const admissionPromise = barrier.runWithPersistentDataErasureBarrier(admission);
  await Promise.resolve();
  expect(admission).not.toHaveBeenCalled();

  releasePublish();
  await expect(recovered).resolves.toBe(1);
  await admissionPromise;
  expect(admission).toHaveBeenCalledOnce();
});
