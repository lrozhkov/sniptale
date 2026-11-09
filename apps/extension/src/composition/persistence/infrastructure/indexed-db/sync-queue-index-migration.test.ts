import { afterEach, expect, it, vi } from 'vitest';
import {
  estimateSyncQueueSummaryIndexBytes,
  installSyncQueueSummaryIndexes,
  installSyncQueueSummaryStoreIndexes,
  SYNC_QUEUE_SUMMARY_INDEXES,
} from './sync-queue-index-migration';
import type { DatabaseMigrationSource } from './upgrade/types';
import { DATABASE_MIGRATIONS } from './database-migrations';
import { executeDatabaseUpgrade } from './upgrade/core';

function sourceCounts(operations = 10, pending = 2, queue = 7) {
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen: boolean, upperOpen: boolean) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
  const count = vi.fn(async (query: IDBValidKey) =>
    query === 'sync-operation' ? operations : pending
  );
  const physicalCount = vi.fn(async () => queue);
  const forbidden = vi.fn(() => {
    throw new Error('Source values must not be read or changed.');
  });
  const source: DatabaseMigrationSource = {
    transaction: vi.fn((name: string) => ({
      store: {
        openCursor: forbidden,
        count: name === 'sync_outbox' ? physicalCount : forbidden,
        index: (index: string) => {
          expect(name).toBe('sync_capture');
          expect(index).toBe('kind');
          return { count };
        },
      },
    })),
  };
  return { source, count, physicalCount, forbidden };
}
afterEach(() => vi.unstubAllGlobals());

it('installs exactly three nonunique projections with identical fresh and upgrade key paths', () => {
  const recordIndex = () =>
    vi.fn<(name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown>();
  const create = new Map([
    ['sync_capture', recordIndex()],
    ['sync_outbox', recordIndex()],
  ]);
  const forbidden = vi.fn(() => {
    throw new Error('No source operation is allowed.');
  });
  const transaction = {
    abort: forbidden,
    objectStore: (name: string) => ({
      createIndex: create.get(name)!,
      clear: forbidden,
      delete: forbidden,
      getAll: forbidden,
      openCursor: forbidden,
      put: forbidden,
    }),
  };
  installSyncQueueSummaryIndexes(transaction);
  for (const { storeName, indexName, keyPath } of SYNC_QUEUE_SUMMARY_INDEXES)
    expect(create.get(storeName)).toHaveBeenCalledWith(indexName, [...keyPath], { unique: false });
  expect([...create.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(3);
  for (const [storeName, createIndex] of create) {
    const fresh = vi.fn();
    installSyncQueueSummaryStoreIndexes(storeName, { createIndex: fresh });
    expect(fresh.mock.calls).toEqual(createIndex.mock.calls);
  }
  expect(forbidden).not.toHaveBeenCalled();
});

it('estimates only actual indexed categories with exactly three count requests', async () => {
  for (const size of [10, 1000]) {
    const f = sourceCounts(size, 2, size);
    await expect(estimateSyncQueueSummaryIndexBytes(f.source)).resolves.toBe(
      65536 + 16384 * (size * 2 + 2)
    );
    expect(f.count.mock.calls).toEqual([['sync-operation'], ['pending-checkpoint']]);
    expect(f.physicalCount).toHaveBeenCalledExactlyOnceWith({
      lower: 'queue-operation-v1:',
      upper: 'queue-operation-v1;',
      lowerOpen: false,
      upperOpen: true,
    });
    expect(f.forbidden).not.toHaveBeenCalled();
    expect(f.source.transaction).toHaveBeenCalledTimes(2);
    expect(f.source.transaction).toHaveBeenNthCalledWith(1, 'sync_capture', 'readonly');
    expect(f.source.transaction).toHaveBeenNthCalledWith(2, 'sync_outbox', 'readonly');
  }
});

it('reserves the fixed baseline for empty categories without scanning unrelated roots or receipts', async () => {
  const f = sourceCounts(0, 0, 0);
  await expect(estimateSyncQueueSummaryIndexBytes(f.source)).resolves.toBe(65536);
  expect(f.forbidden).not.toHaveBeenCalled();
});

it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'refuses invalid count %s without a cursor fallback',
  async (value) => {
    const f = sourceCounts(value);
    await expect(estimateSyncQueueSummaryIndexBytes(f.source)).rejects.toThrow('count is invalid');
    expect(f.forbidden).not.toHaveBeenCalled();
  }
);

it('refuses unsafe count arithmetic and failed native requests', async () => {
  const f = sourceCounts(Number.MAX_SAFE_INTEGER);
  await expect(estimateSyncQueueSummaryIndexBytes(f.source)).rejects.toThrow('safe range');
  f.count.mockRejectedValueOnce(new Error('Native count failed.'));
  await expect(estimateSyncQueueSummaryIndexBytes(f.source)).rejects.toThrow('Native count failed');
  expect(f.forbidden).not.toHaveBeenCalled();
});

it('requires source count and kind-index capabilities without reading values', async () => {
  await expect(estimateSyncQueueSummaryIndexBytes()).rejects.toThrow('source counts');
  for (const store of [
    { openCursor: vi.fn() },
    { openCursor: vi.fn(), count: vi.fn(), index: () => ({}) },
  ]) {
    await expect(
      estimateSyncQueueSummaryIndexBytes({ transaction: () => ({ store }) })
    ).rejects.toThrow('unavailable');
    expect(store.openCursor).not.toHaveBeenCalled();
  }
});

it('covers maximally escaped canonical primary and scope keys within the entry reserve', () => {
  const spaceId = '\u0000'.repeat(256);
  const operationId = '\u0000'.repeat(256);
  const scope = [spaceId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  const queueKey = `queue-operation-v1:${JSON.stringify(scope)}:${JSON.stringify(operationId)}`;
  expect(JSON.stringify(spaceId).length).toBe(256 * 6 + 2);
  expect(queueKey.length).toBeLessThan(3200);

  // Native tuple strings retain raw UTF-16 units; only the serialized primary key expands escapes.
  const numericBytes = 2 * 8;
  const structuralReserve = 512;
  const tupleBytes = (kind: string, phaseOrStatus: string) =>
    2 * (kind.length + phaseOrStatus.length + spaceId.length) + numericBytes + structuralReserve;
  const queueLogicalBytes = 2 * queueKey.length + tupleBytes('queue-operation', 'interrupted');
  const captureLogicalBytes = 2 * 2048 + tupleBytes('sync-operation', 'published');
  for (const logicalBytes of [queueLogicalBytes, captureLogicalBytes]) {
    expect(logicalBytes).toBeLessThan(8192);
    expect(2 * logicalBytes).toBeLessThan(16 * 1024);
  }
});

it('aborts index installation failure before contracts publish and retries the same additive step', () => {
  const descriptor = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 50)!;
  const source = new Map([
    ['sync_capture', [{ payload: new Blob(['retained']) }]],
    ['sync_outbox', [{ retained: true }]],
  ]);
  const before = structuredClone(source);
  const forbidden = vi.fn(() => {
    throw new Error('Source mutation refused.');
  });
  const contracts = vi.fn();
  const createIndex = vi.fn().mockImplementationOnce(() => {
    throw new DOMException('No space', 'QuotaExceededError');
  });
  const transaction = {
    abort: vi.fn(),
    objectStore: (name: string) => ({
      createIndex,
      clear: forbidden,
      delete: forbidden,
      getAll: forbidden,
      put: name === 'schema_contracts' ? contracts : forbidden,
    }),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: forbidden,
    deleteObjectStore: forbidden,
  };
  expect(() => executeDatabaseUpgrade(db, 50, 51, transaction, [descriptor])).toThrow('No space');
  expect(transaction.abort).toHaveBeenCalledOnce();
  expect(contracts).not.toHaveBeenCalled();
  expect(source).toEqual(before);
  createIndex.mockReset();
  executeDatabaseUpgrade(db, 50, 51, transaction, [descriptor]);
  expect(createIndex).toHaveBeenCalledTimes(3);
  expect(contracts).toHaveBeenCalled();
  expect(source).toEqual(before);
  expect(forbidden).not.toHaveBeenCalled();
});
