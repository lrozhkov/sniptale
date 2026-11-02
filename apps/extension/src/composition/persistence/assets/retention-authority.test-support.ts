import { EXPECTED_STORES } from '../infrastructure/indexed-db/core';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import type { PublishedCaptureOperation } from '../sync-capture/contracts';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { projectRowReferenceKeys } from './retention-index-projection';
import { ROW_REFERENCE_INDEX } from '../infrastructure/indexed-db/row-index-contract';
import { vi } from 'vitest';

/** Model bounded native request reads over one immutable per-store fixture snapshot. */
export function createRetentionDatabaseFixture(readRows: (store: string) => Promise<unknown[]>) {
  const fullRead = vi.fn(async (store: string) => readRows(store));
  const abort = vi.fn();
  const pages = vi.fn();
  const transaction = vi.fn((names: string[]) => {
    const name = names[0];
    if (!name) throw new Error('Missing fixture store');
    const snapshot = readRows(name).then((rows) => structuredClone(rows));
    const read = async (range: unknown, count: number | undefined, keys: boolean) => {
      pages(name, range, count, keys);
      if (count !== 64) throw new Error('Unbounded fixture request');
      const lower =
        typeof range === 'object' &&
        range !== null &&
        'lower' in range &&
        typeof range.lower === 'number'
          ? range.lower
          : -1;
      const rows = await snapshot;
      return keys
        ? rows.map((_, index) => index).slice(lower + 1, lower + 1 + count)
        : rows.slice(lower + 1, lower + 1 + count);
    };
    return {
      done: Promise.resolve(),
      abort,
      objectStore: () => ({
        getAll: (range?: unknown, count?: number) => read(range, count, false),
        getAllKeys: (range?: unknown, count?: number) => read(range, count, true),
      }),
    };
  });
  const getAllFromIndex = async (store: string, index: string, key: IDBValidKey) =>
    (await readRows(store)).filter((row) => isRecord(row) && row[index] === key);
  const result = { getAll: fullRead, getAllFromIndex, transaction, pages, abort };
  return result;
}

/** Model native point locators for directly seeded claim fixtures; no product fallback scan. */
export function createTargetAssetDatabaseFixture(readRows: (store: string) => Promise<unknown[]>) {
  const requests = vi.fn();
  const keyFor = (row: unknown): IDBValidKey | undefined => {
    if (!isRecord(row)) return undefined;
    if (
      typeof row['ownerKind'] === 'string' &&
      typeof row['ownerId'] === 'string' &&
      typeof row['role'] === 'string'
    )
      return [row['ownerKind'], row['ownerId'], row['role']];
    const key =
      row['id'] ?? row['aggregateId'] ?? row['operationId'] ?? row['key'] ?? row['assetId'];
    return typeof key === 'string' ? key : undefined;
  };
  const transaction = (names: string[], _mode: 'readonly') => {
    const snapshots = new Map(
      names.map((name) => [name, readRows(name).then((rows) => structuredClone(rows))])
    );
    const read = async (name: string) => {
      const rows = snapshots.get(name);
      if (!rows) throw new Error('Fixture store outside transaction');
      return rows;
    };
    return {
      done: Promise.resolve(),
      abort: vi.fn(),
      objectStore: (name: string) => ({
        get: async (key: IDBValidKey) => {
          requests(name, 'get', key);
          return (await read(name)).find(
            (row) => JSON.stringify(keyFor(row)) === JSON.stringify(key)
          );
        },
        index: (index: string) => {
          const matches = async (key: IDBValidKey) =>
            (await read(name)).filter((row) =>
              index === ROW_REFERENCE_INDEX
                ? projectRowReferenceKeys(name, row).includes(typeof key === 'string' ? key : '')
                : isRecord(row) && row[index] === key
            );
          return {
            getAll: async (key: IDBValidKey) => {
              requests(name, index, key);
              return matches(key);
            },
            getKey: async (key: IDBValidKey) => {
              requests(name, index, key);
              const rows = await matches(key);
              return rows.length ? (keyFor(rows[0]) ?? 'invalid-fixture-row') : undefined;
            },
          };
        },
      }),
    };
  };
  return { transaction, requests };
}

export function createPublicationReleaseFixture() {
  let refuseIntent = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => refuseIntent && name === 'asset_operations'
  );
  for (const name of EXPECTED_STORES)
    if (!fixture.rows.has(name)) fixture.rows.set(name, new Map());
  const table = (name: string) => fixture.rows.get(name)!;
  const ref = {
    assetId: 'published-file',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/published-file' },
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
    size: 3,
  };
  const publication: PublishedCaptureOperation = {
    version: 1,
    kind: 'sync-operation',
    phase: 'published',
    key: '["change","operation"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 1,
    rootKind: 'media',
    rootId: 'old',
    rootKey: JSON.stringify(['space', 'media', 'old']),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    sourceSha256: 'b'.repeat(64),
    source: { changeKind: 'media', label: 'old.png' },
    publication: {
      kind: 'verified',
      acceptedAt: 2,
      preparedSha256: 'c'.repeat(64),
      attemptId: '11111111-1111-4111-8111-111111111111',
      recordKey: 'records/manifest.json',
      recordSha256: 'd'.repeat(64),
    },
    objects: [
      {
        objectId: 'body',
        ref,
        filename: 'old.png',
        sha256: 'a'.repeat(64),
        remoteKey: 'Files/published/old.png',
        pinned: true,
      },
    ],
  };
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  table('sync_capture').set(publication.key, publication);
  table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      spaceId: 'space',
      connectionGeneration: 3,
      profileCreatedAt: 1,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  });
  let intentNumber = 0;
  vi.mocked(crypto.randomUUID).mockImplementation(
    () => `00000000-0000-4000-8000-${String(++intentNumber).padStart(12, '0')}`
  );
  const database = {
    ...fixture.database,
    delete: async (name: string, key: string) => {
      table(name).delete(key);
    },
  };
  return {
    ...fixture,
    database,
    table,
    publication,
    authorization,
    ref,
    refuseIntent(value: boolean) {
      refuseIntent = value;
    },
  };
}
