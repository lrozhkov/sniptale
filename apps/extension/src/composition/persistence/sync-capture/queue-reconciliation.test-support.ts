import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import type { SyncConnectionIdentity, SyncConnectionMetadata } from '../remote-connection/model';
import { captureRootKey, type CapturedChange } from './contracts';
import { parseSyncQueueConnection, queueConnectionKey, type SyncQueueScope } from './queue-model';

export const scope: SyncQueueScope = {
  spaceId: 'space',
  connectionGeneration: 3,
  profileCreatedAt: 1,
};
export const authorization: SyncConnectionIdentity = {
  incarnation: '22222222-2222-4222-8222-222222222222',
  revision: 1,
};
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function validKey(value: unknown): value is IDBValidKey {
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  return Array.isArray(value) && value.every(validKey);
}
function compareKeys(left: IDBValidKey, right: IDBValidKey): number {
  const rank = (value: IDBValidKey) =>
    typeof value === 'number'
      ? 0
      : value instanceof Date
        ? 1
        : typeof value === 'string'
          ? 2
          : Array.isArray(value)
            ? 4
            : 3;
  const difference = rank(left) - rank(right);
  if (difference) return difference;
  if (typeof left === 'string' && typeof right === 'string')
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === 'number' && typeof right === 'number')
    return left < right ? -1 : left > right ? 1 : 0;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const comparison = compareKeys(left[index]!, right[index]!);
      if (comparison) return comparison;
    }
    return left.length - right.length;
  }
  const bytes = (value: IDBValidKey) => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new Error('Invalid binary key');
  };
  const first = bytes(left);
  const second = bytes(right);
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    const comparison = first[index]! - second[index]!;
    if (comparison) return comparison;
  }
  return first.length - second.length;
}
export function withoutCaptureProgress(rows: Map<string, Map<string, unknown>>) {
  const copy = structuredClone(rows);
  for (const [key, value] of copy.get('sync_outbox') ?? []) {
    const connection = parseSyncQueueConnection(value);
    if (!connection) continue;
    const { captureProgress: ignored, ...rest } = connection;
    void ignored;
    copy.get('sync_outbox')!.set(key, rest);
  }
  return copy;
}
export function progress(f: ReturnType<typeof createReconciliationFixture>) {
  return parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))
    ?.captureProgress;
}
export function createReconciliationFixture() {
  let writesBeforeFailure: number | null = null;
  let failProgress = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name === 'sync_outbox' && failProgress) {
      failProgress = false;
      return true;
    }
    if (name !== 'sync_outbox' || writesBeforeFailure === null) return false;
    if (writesBeforeFailure > 0) {
      writesBeforeFailure -= 1;
      return false;
    }
    writesBeforeFailure = null;
    return true;
  });
  const table = (name: string) => fixture.rows.get(name)!;
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  const connection: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: structuredClone(authorization),
    phase: 'active',
    updateNonce: null,
    credentialId: '44444444-4444-4444-8444-444444444444',
  };
  table('sync_capture').set('profile', profile);
  table('sync_connection').set('connection', connection);
  const capture = (id: string): CapturedChange => {
    const row: CapturedChange = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', id]),
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: id,
      rootKey: captureRootKey('space', 'media', id),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    });
    table('sync_capture').set(row.key, structuredClone(row));
    return row;
  };
  return {
    ...fixture,
    table,
    profile,
    connection,
    capture,
    failNextProgressWrite() {
      failProgress = true;
    },
    failAfterOneWrite() {
      writesBeforeFailure = 1;
    },
  };
}
export function installReconciliationKeyRanges(): void {
  vi.stubGlobal('IDBKeyRange', {
    lowerBound: (lower: IDBValidKey, lowerOpen = false) => ({
      lower,
      lowerOpen,
      upper: undefined,
      upperOpen: false,
    }),
    only: (key: unknown) => {
      if (!validKey(key)) throw new DOMException('Invalid key', 'DataError');
      return {
        lower: key,
        upper: key,
        lowerOpen: false,
        upperOpen: false,
        includes: (other: IDBValidKey) => compareKeys(key, other) === 0,
      };
    },
  });
}
