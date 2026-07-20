import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../mutation-barrier';
import { STATE_MANAGER_STORE } from './core.stores.ts';
import { createIndexedDbStateDomainAdapter } from './state-manager-adapter';

type IndexedDbStateRecord = {
  domain: string;
  key: string;
  updatedAtEpochMs: number;
  value: unknown;
};

function createRecordKey(domain: string, key: string): string {
  return `${domain}\u0000${key}`;
}

function isRecordWithDomain(value: unknown, domain: string): boolean {
  return (
    Boolean(value) && typeof value === 'object' && (value as { domain?: unknown }).domain === domain
  );
}

function createFakeDatabase() {
  const records = new Map<string, unknown>();

  return {
    delete: vi.fn(async (store: string, key: [string, string]) => {
      expect(store).toBe(STATE_MANAGER_STORE);
      records.delete(createRecordKey(key[0], key[1]));
    }),
    get: vi.fn(async (store: string, key: [string, string]) => {
      expect(store).toBe(STATE_MANAGER_STORE);
      return records.get(createRecordKey(key[0], key[1]));
    }),
    getAllFromIndex: vi.fn(async (store: string, indexName: string, domain: string) => {
      expect(store).toBe(STATE_MANAGER_STORE);
      expect(indexName).toBe('domain');
      return [...records.values()].filter((record) => isRecordWithDomain(record, domain));
    }),
    put: vi.fn(async (store: string, record: IndexedDbStateRecord) => {
      expect(store).toBe(STATE_MANAGER_STORE);
      records.set(createRecordKey(record.domain, record.key), record);
    }),
    records,
  };
}

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

async function verifyMutationInitializationPermit() {
  let lockQueue = Promise.resolve();
  installPersistenceLockManagerForTests({
    request(_name, _options, operation) {
      const execution = lockQueue.then(operation);
      lockQueue = execution.then(
        () => undefined,
        () => undefined
      );
      return execution;
    },
  });
  const fakeDb = createFakeDatabase();
  let resolveDatabase!: (database: typeof fakeDb) => void;
  let receivedPermit: unknown;
  const database = new Promise<typeof fakeDb>((resolve) => {
    resolveDatabase = resolve;
  });
  const adapter = createIndexedDbStateDomainAdapter('domain.a', async (permit) => {
    receivedPermit = permit;
    return database;
  });

  const write = adapter.write('key', 'value');
  await vi.waitFor(() => expect(isActivePersistenceMutationPermit(receivedPermit)).toBe(true));
  const erase = vi.fn(async () => undefined);
  const erasure = runWithPersistentDataErasureBarrier(erase);
  resolveDatabase(fakeDb);

  await write;
  await erasure;
  expect(fakeDb.put).toHaveBeenCalledOnce();
  expect(erase).toHaveBeenCalledOnce();
  expect(isActivePersistenceMutationPermit(receivedPermit)).toBe(false);
}

describe('createIndexedDbStateDomainAdapter persistence', () => {
  let fakeDb: ReturnType<typeof createFakeDatabase>;

  beforeEach(() => {
    fakeDb = createFakeDatabase();
  });

  it('persists and hydrates only records for the registered domain', async () => {
    const adapter = createIndexedDbStateDomainAdapter('domain.a', async () => fakeDb);
    const otherAdapter = createIndexedDbStateDomainAdapter('domain.b', async () => fakeDb);

    await adapter.write('one', { value: 1 });
    await adapter.writeMany!({ two: { value: 2 }, three: { value: 3 } });
    await otherAdapter.write('one', { value: 'other' });

    await expect(adapter.read!('one')).resolves.toEqual({ value: 1 });
    await expect(adapter.hydrate!()).resolves.toEqual({
      one: { value: 1 },
      three: { value: 3 },
      two: { value: 2 },
    });
    await expect(otherAdapter.hydrate!()).resolves.toEqual({ one: { value: 'other' } });
  });

  it(
    'initializes mutation storage inside the single shared permit',
    verifyMutationInitializationPermit
  );
});

describe('createIndexedDbStateDomainAdapter removal and guards', () => {
  let fakeDb: ReturnType<typeof createFakeDatabase>;

  beforeEach(() => {
    fakeDb = createFakeDatabase();
  });

  it('removes records by key and clears only the registered domain', async () => {
    const adapter = createIndexedDbStateDomainAdapter('domain.a', async () => fakeDb);
    const otherAdapter = createIndexedDbStateDomainAdapter('domain.b', async () => fakeDb);

    await adapter.writeMany!({ one: 1, two: 2, three: 3 });
    await otherAdapter.write('one', 'other');

    await adapter.remove('one');
    await adapter.removeMany!(['two']);
    await expect(adapter.hydrate!()).resolves.toEqual({ three: 3 });

    await adapter.clear!();
    await expect(adapter.hydrate!()).resolves.toEqual({});
    await expect(otherAdapter.hydrate!()).resolves.toEqual({ one: 'other' });
  });

  it('filters malformed IndexedDB row envelopes before exposing values', async () => {
    const adapter = createIndexedDbStateDomainAdapter('domain.a', async () => fakeDb);

    fakeDb.records.set(createRecordKey('domain.a', 'bad-key'), {
      domain: 'domain.a',
      key: 42,
      updatedAtEpochMs: Date.now(),
      value: 'unsafe',
    });
    fakeDb.records.set(createRecordKey('domain.a', 'bad-updated-at'), {
      domain: 'domain.a',
      key: 'bad-updated-at',
      updatedAtEpochMs: Number.NaN,
      value: 'unsafe',
    });
    fakeDb.records.set(createRecordKey('domain.a', 'missing-value'), {
      domain: 'domain.a',
      key: 'missing-value',
      updatedAtEpochMs: Date.now(),
    });

    await expect(adapter.hydrate!()).resolves.toEqual({});
    await expect(adapter.read!('bad-key')).resolves.toBeUndefined();
  });
});
