import { beforeEach, expect, it, vi } from 'vitest';
import type { VoiceHistoryEntry } from '@sniptale/runtime-contracts/voice-input';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { createVoiceHistoryCatalogStorage, type VoiceHistoryCatalog } from './catalog';
import { deferred } from './test-support';

const mocks = vi.hoisted(() => ({ initDB: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
beforeEach(() => vi.clearAllMocks());

function catalog(): VoiceHistoryCatalog {
  const entry: VoiceHistoryEntry = {
    entryId: 'accepted',
    incarnation: 'first',
    epoch: 'current',
    revision: 2,
    audioDigest: `sha256:${'a'.repeat(64)}`,
    sequence: 1,
    createdAt: 10,
    backend: 'model',
    language: 'en-US',
    durationSeconds: 1,
    byteLength: 5,
    mimeType: 'audio/webm',
    rawTranscript: 'saved raw',
    transcript: null,
    status: 'processing',
    correctionStatus: 'off',
    failureCode: null,
  };
  return {
    id: 'catalog',
    version: 1,
    epoch: 'current',
    nextSequence: 3,
    entries: [entry],
    captures: [
      { entryId: 'pending', incarnation: 'second', epoch: 'current', sequence: 2, createdAt: 11 },
    ],
    pendingDeletes: ['previous.removed.incarnation'],
  };
}

function databaseFixture(initial: unknown = undefined) {
  let value: unknown = structuredClone(initial);
  const put = vi.fn<(next: VoiceHistoryCatalog) => Promise<void>>().mockResolvedValue(undefined);
  const complete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const get = vi.fn(async () => structuredClone(value));
  const transaction = vi.fn((_store: string, _mode: string, _options: IDBTransactionOptions) => {
    let pending: unknown;
    return {
      store: {
        async put(next: VoiceHistoryCatalog) {
          await put(next);
          pending = structuredClone(next);
        },
      },
      get done() {
        return complete().then(() => {
          value = pending;
        });
      },
    };
  });
  mocks.initDB.mockResolvedValue({ get, transaction });
  return {
    storage: createVoiceHistoryCatalogStorage(),
    get,
    put,
    complete,
    transaction,
    peek: () => structuredClone(value),
    replace: (next: unknown) => {
      value = structuredClone(next);
    },
  };
}

it('roundtrips accepted metadata with pending capture and deletion intents through the real adapter', async () => {
  const f = databaseFixture();
  const original = catalog();
  await runWithPersistenceMutationPermit(async (permit) => {
    await f.storage.write(original, permit);
    expect(mocks.initDB).toHaveBeenLastCalledWith(permit);
    expect(await f.storage.read(permit)).toEqual(original);
    expect(mocks.initDB).toHaveBeenLastCalledWith(permit);
  });
  expect(f.transaction).toHaveBeenCalledExactlyOnceWith('voice_input_history', 'readwrite', {
    durability: 'strict',
  });
  expect(f.peek()).toEqual(original);
});

it('reads an absent catalog without opening a write transaction', async () => {
  const f = databaseFixture();
  expect(await f.storage.read()).toBeNull();
  expect(f.get).toHaveBeenCalledExactlyOnceWith('voice_input_history', 'catalog');
  expect(f.transaction).not.toHaveBeenCalled();
  expect(f.peek()).toBeUndefined();
});

it('waits for native transaction completion before acknowledging replacement metadata', async () => {
  const original = catalog();
  const f = databaseFixture(original);
  const entered = deferred();
  const release = deferred();
  f.complete.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const next = { ...original, nextSequence: 4 };
  const writing = f.storage.write(next);
  await entered.promise;
  expect(await f.storage.read()).toEqual(original);
  release.resolve();
  await writing;
  expect(await f.storage.read()).toEqual(next);
});

it.each(['put', 'commit'] as const)(
  'retains accepted catalog after native %s failure',
  async (phase) => {
    const original = catalog();
    const f = databaseFixture(original);
    const failure = new DOMException('Synthetic disk full', 'QuotaExceededError');
    (phase === 'put' ? f.put : f.complete).mockRejectedValueOnce(failure);
    await expect(f.storage.write({ ...original, nextSequence: 4 })).rejects.toBe(failure);
    expect(await f.storage.read()).toEqual(original);
  }
);

it('propagates database admission and read failures without resetting accepted metadata', async () => {
  const original = catalog();
  const f = databaseFixture(original);
  const blocked = new Error('Synthetic database blocked');
  mocks.initDB.mockRejectedValueOnce(blocked);
  await expect(f.storage.read()).rejects.toBe(blocked);
  const unavailable = new DOMException('Synthetic read failure', 'NotReadableError');
  f.get.mockRejectedValueOnce(unavailable);
  await expect(f.storage.read()).rejects.toBe(unavailable);
  expect(f.transaction).not.toHaveBeenCalled();
  expect(f.peek()).toEqual(original);
});

it('rejects malformed authoritative rows without migration repair or replacement', async () => {
  const f = databaseFixture();
  for (const row of [
    null,
    [],
    'legacy',
    {},
    { ...catalog(), version: 2 },
    { ...catalog(), entries: [null] },
  ]) {
    f.replace(row);
    await expect(f.storage.read()).rejects.toThrow('storage-failed');
    expect(f.peek()).toEqual(row);
  }
  expect(f.transaction).not.toHaveBeenCalled();
});

it('refuses stale or colliding admission identities without changing the catalog', async () => {
  const f = databaseFixture();
  const source = catalog();
  const entry = source.entries[0]!;
  const capture = source.captures[0]!;
  const rows = [
    { ...source, entries: [{ ...entry, epoch: 'erased' }] },
    { ...source, entries: [{ ...entry, sequence: source.nextSequence }] },
    { ...source, entries: [entry, { ...entry, sequence: 2 }], captures: [] },
    { ...source, entries: [entry, { ...entry, entryId: 'other' }], captures: [] },
    { ...source, captures: [{ ...capture, incarnation: '' }] },
    { ...source, captures: [{ ...capture, epoch: 'erased' }] },
    { ...source, captures: [{ ...capture, sequence: source.nextSequence }] },
    { ...source, captures: [{ ...capture, sequence: entry.sequence }] },
  ];
  for (const row of rows) {
    f.replace(row);
    await expect(f.storage.read()).rejects.toThrow('storage-failed');
    expect(f.peek()).toEqual(row);
  }
  expect(f.transaction).not.toHaveBeenCalled();
});

it('refuses unsafe duplicate or live-object deletion intents while preserving their source', async () => {
  const f = databaseFixture();
  const source = catalog();
  for (const pendingDeletes of [
    [null],
    ['../outside'],
    ['x'.repeat(387)],
    ['old.removed.audio', 'old.removed.audio'],
    ['current.accepted.first'],
  ]) {
    const row = { ...source, pendingDeletes };
    f.replace(row);
    await expect(f.storage.read()).rejects.toThrow('storage-failed');
    expect(f.peek()).toEqual(row);
  }
  expect(f.transaction).not.toHaveBeenCalled();
});
