import { expect, it, vi } from 'vitest';
import { workspace } from '../../review-workspaces/backup-restore.test-support';
import { workspaceStorageHead, workspaceStorageRows } from '../../review-workspaces/storage-format';
import type { UpgradeTransaction } from './upgrade/types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  installDeletionReferenceIndexes,
  estimateDeletionReferenceIndexBytes,
} from './deletion-index-migration';
import {
  REFERENCE_INDEX_STORES,
  ROW_REFERENCE_FIELD,
  ROW_REFERENCE_INDEX,
  UNKNOWN_ASSET_REFERENCES,
  UNKNOWN_HISTORY_REFERENCES,
  stripRowReferenceMetadata,
} from './row-index-contract';

interface MigrationFixtureOptions {
  records?: Map<string, unknown[]>;
  failRead?: boolean;
}

function migrationFixture(failFirstWrite: boolean, options: MigrationFixtureOptions = {}) {
  const original =
    options.records ??
    new Map<string, unknown[]>([
      [
        'project_assets',
        [
          { id: 'private', assetId: 'bytes', createdAt: 1, mimeType: 'image/png', size: 3 },
          { id: 'unknown', assetId: null },
        ],
      ],
      ['video_workspace_history', [{ aggregateId: 'orphan', ordinal: 0, invalid: true }]],
    ]);
  let records = structuredClone(original);
  const indexes = new Set<string>();
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let headPasses = 0;
  const abort = vi.fn(() => {
    records = structuredClone(original);
    indexes.clear();
    complete();
  });
  const transaction = {
    abort,
    objectStore: (name: string) => ({
      createIndex: (index: string) => {
        if (
          index !== ROW_REFERENCE_INDEX &&
          !(name === 'recording_recovery_sessions' && index === 'recoveryId')
        )
          throw new Error('Unexpected fixture index');
        indexes.add(name);
      },
      getAll: () => records.get(name) ?? [],
      clear: () => undefined,
      delete: (_key: IDBValidKey) => undefined,
      put: (value: unknown) => {
        if (!isRecord(value)) throw new Error('Invalid fixture row');
        const rows = records.get(name) ?? [];
        const offset = rows.findIndex(
          (row) =>
            isRecord(row) &&
            row['aggregateId'] === value['aggregateId'] &&
            row['ordinal'] === value['ordinal']
        );
        if (offset < 0) throw new Error('Missing fixture row');
        rows[offset] = value;
      },
      index: (_index: string) => ({
        getAll: async (id: IDBValidKey) =>
          (records.get(name) ?? []).filter((row) => isRecord(row) && row['aggregateId'] === id),
      }),
      openCursor: async () => {
        if (options.failRead) throw new Error('Injected source read failure');
        if (name === 'video_workspaces') headPasses++;
        const rows = records.get(name) ?? [];
        let offset = 0;
        const next = (): ReturnType<typeof cursor> | null => {
          if (offset < rows.length) return cursor();
          if (name === 'video_workspaces' && headPasses === 2) complete();
          return null;
        };
        const cursor = () => ({
          get value(): unknown {
            return rows[offset];
          },
          update: async (value: unknown) => {
            rows[offset] = value;
            records.set(name, rows);
            if (failFirstWrite) throw new Error('Injected native update failure');
          },
          continue: async () => {
            offset++;
            return next();
          },
        });
        return next();
      },
    }),
  };
  return { transaction, done, abort, indexes, records: () => records, original };
}

it('aborts an incomplete index upgrade and rebuilds all claims on retry', async () => {
  const failed = migrationFixture(true);
  expect(installDeletionReferenceIndexes(failed.transaction)).toBeUndefined();
  await failed.done;
  expect(failed.abort).toHaveBeenCalledOnce();
  expect(failed.records()).toEqual(failed.original);
  expect(failed.indexes.size).toBe(0);
  const retry = migrationFixture(false);
  installDeletionReferenceIndexes(retry.transaction);
  await retry.done;
  expect(retry.abort).not.toHaveBeenCalled();
  expect([...retry.indexes]).toEqual([...REFERENCE_INDEX_STORES, 'recording_recovery_sessions']);
  const assets = retry.records().get('project_assets') ?? [];
  expect(assets.map(stripRowReferenceMetadata)).toEqual(retry.original.get('project_assets'));
  expect(assets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'private',
        [ROW_REFERENCE_FIELD]: expect.arrayContaining(['asset:bytes']),
      }),
      expect.objectContaining({
        id: 'unknown',
        [ROW_REFERENCE_FIELD]: expect.arrayContaining([UNKNOWN_ASSET_REFERENCES]),
      }),
    ])
  );
  expect(retry.records().get('video_workspace_history')).toEqual([
    {
      aggregateId: 'orphan',
      ordinal: 0,
      invalid: true,
      [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES],
    },
  ]);
});

it('refuses quota estimation without source inspection and counts retained history metadata', async () => {
  await expect(estimateDeletionReferenceIndexBytes()).rejects.toThrow('source quota inspection');
  const estimate = await estimateDeletionReferenceIndexBytes({
    transaction: (name: string) => ({
      store: {
        openCursor: async () =>
          name === 'video_workspace_history'
            ? {
                value: { aggregateId: 'review', ordinal: 0, retained: 'x'.repeat(10000) },
                primaryKey: ['review', 0],
                continue: async () => null,
              }
            : null,
      },
    }),
  });
  expect(estimate).toBeGreaterThan(64 * 1024 + 80000);
});

it('backfills admitted workspace heads while preserving invalid and orphan history evidence', async () => {
  const valid = { ...workspace, aggregateId: 'valid', sourceMediaId: 'archived-origin' };
  const invalid = { ...workspace, aggregateId: 'invalid' };
  const validRows = workspaceStorageRows(valid);
  const invalidRows = workspaceStorageRows(invalid).slice(1);
  const orphan = { aggregateId: 'orphan', ordinal: 0, retained: 'unreadable' };
  const records = new Map<string, unknown[]>([
    [
      'video_workspaces',
      [workspaceStorageHead(valid, ['forged']), workspaceStorageHead(invalid, ['forged'])],
    ],
    ['video_workspace_history', [...validRows, ...invalidRows, orphan]],
  ]);
  const fixture = migrationFixture(false, { records });
  installDeletionReferenceIndexes(fixture.transaction);
  await fixture.done;
  expect(fixture.abort).not.toHaveBeenCalled();
  expect(fixture.records().get('video_workspaces')).toEqual([
    {
      ...workspaceStorageHead(valid, ['forged']),
      [ROW_REFERENCE_FIELD]: ['media:valid', 'media:archived-origin'],
    },
    {
      ...workspaceStorageHead(invalid, ['forged']),
      [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES],
    },
  ]);
  expect(fixture.records().get('video_workspace_history')).toEqual([
    ...validRows.map((row) => ({ ...row, [ROW_REFERENCE_FIELD]: [] })),
    ...invalidRows.map((row) => ({ ...row, [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES] })),
    { ...orphan, [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES] },
  ]);
  for (const [name, rows] of records) {
    expect(fixture.records().get(name)?.map(stripRowReferenceMetadata)).toEqual(rows);
  }
});

it('aborts an unreadable source backfill without publishing a partial schema and retries from source', async () => {
  const failed = migrationFixture(false, { failRead: true });
  installDeletionReferenceIndexes(failed.transaction);
  await failed.done;
  expect(failed.abort).toHaveBeenCalledOnce();
  expect(failed.records()).toEqual(failed.original);
  expect(failed.indexes.size).toBe(0);
  const retry = migrationFixture(false, { records: failed.records() });
  installDeletionReferenceIndexes(retry.transaction);
  await retry.done;
  expect(retry.abort).not.toHaveBeenCalled();
  expect(retry.records().get('project_assets')).toContainEqual(
    expect.objectContaining({ id: 'private', [ROW_REFERENCE_FIELD]: ['asset:bytes'] })
  );
});

it.each(['project_assets', 'recording_recovery_sessions'])(
  'refuses schema installation without native index creation in %s',
  (missing) => {
    const fixture = migrationFixture(false);
    const transaction: UpgradeTransaction = {
      ...fixture.transaction,
      objectStore: (name) => {
        const store = fixture.transaction.objectStore(name);
        const { createIndex: _createIndex, ...unavailable } = store;
        return name === missing ? unavailable : store;
      },
    };
    expect(() => installDeletionReferenceIndexes(transaction)).toThrow(
      'index creation is unavailable'
    );
    expect(fixture.records()).toEqual(fixture.original);
  }
);

it('aborts when source cursor capabilities are unavailable', async () => {
  const fixture = migrationFixture(false);
  const transaction: UpgradeTransaction = {
    ...fixture.transaction,
    objectStore: (name) => {
      const { openCursor: _openCursor, ...unavailable } = fixture.transaction.objectStore(name);
      return unavailable;
    },
  };
  installDeletionReferenceIndexes(transaction);
  await fixture.done;
  expect(fixture.abort).toHaveBeenCalledOnce();
  expect(fixture.records()).toEqual(fixture.original);
});

it('propagates quota source failures instead of admitting an uninspected migration', async () => {
  await expect(
    estimateDeletionReferenceIndexBytes({
      transaction: () => ({
        store: {
          openCursor: async () => {
            throw new Error('Quota source unavailable');
          },
        },
      }),
    })
  ).rejects.toThrow('Quota source unavailable');
});
