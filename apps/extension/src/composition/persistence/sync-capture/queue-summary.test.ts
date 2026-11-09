import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { captureRootKey, pendingCheckpointKey } from './contracts';
import { queueConnectionKey, queueOperationKey, type SyncQueueScope } from './queue-model';

const io = vi.hoisted(() => ({
  capture: vi.fn(),
  open: vi.fn(() => {
    throw new Error('Database opening is forbidden');
  }),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.capture,
  initDB: io.open,
}));
import {
  readSyncPendingCheckpointSummaryInTransaction,
  readSyncQueueSummary,
  readSyncQueueSummaryInTransaction,
} from './queue-summary';

const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
const statuses = [
  'queued',
  'running',
  'paused',
  'cancelled',
  'failed',
  'interrupted',
  'published',
] as const;
const indexPaths: Record<string, readonly string[]> = {
  kind: ['kind'],
  syncCaptureScopePhase: ['kind', 'phase', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
  syncPendingScopeDue: ['kind', 'spaceId', 'connectionGeneration', 'profileCreatedAt', 'dueAt'],
  syncQueueScopeStatus: ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
};

function key(value: unknown): value is IDBValidKey {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && !Number.isNaN(value)) ||
    (value instanceof Date && Number.isFinite(value.getTime())) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (Array.isArray(value) && value.every(key))
  );
}
function compare(left: IDBValidKey, right: IDBValidKey): number {
  if (typeof left === 'number' && typeof right === 'number')
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === 'string' && typeof right === 'string')
    return left < right ? -1 : left > right ? 1 : 0;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const order = compare(left[i]!, right[i]!);
      if (order) return order;
    }
    return left.length - right.length;
  }
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
  const order = rank(left) - rank(right);
  if (order) return order;
  const bytes = (value: IDBValidKey) => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new Error('Invalid binary key');
  };
  const first = bytes(left);
  const second = bytes(right);
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    if (first[i] !== second[i]) return first[i]! - second[i]!;
  }
  return first.length - second.length;
}
function range(lower: IDBValidKey, upper?: IDBValidKey, lowerOpen = false, upperOpen = false) {
  return {
    lower,
    upper,
    lowerOpen,
    upperOpen,
    includes: (value: IDBValidKey) =>
      (compare(value, lower) > 0 || (!lowerOpen && compare(value, lower) === 0)) &&
      (upper === undefined ||
        compare(value, upper) < 0 ||
        (!upperOpen && compare(value, upper) === 0)),
  };
}
function matches(value: IDBValidKey, query: unknown): boolean {
  if (query === undefined || query === null) return true;
  if (key(query)) return compare(value, query) === 0;
  if (isRecord(query) && typeof query['includes'] === 'function')
    return query['includes'](value) === true;
  throw new Error('Invalid key query');
}
function fixture(selected: SyncQueueScope = scope) {
  const rows = new Map<string, Map<string, unknown>>([
    ['sync_capture', new Map()],
    ['sync_connection', new Map()],
    ['sync_outbox', new Map()],
  ]);
  const requests: string[] = [];
  const table = (name: string) => {
    const selectedTable = rows.get(name);
    if (!selectedTable) throw new Error(`Forbidden store ${name}`);
    return selectedTable;
  };
  let closed = false;
  let complete: () => void = () => undefined;
  let missingIndex: string | null = null;
  let malformedIndex: string | null = null;
  let completionFailure = false;
  const store = (name: string) => ({
    indexNames: {
      contains: (index: string) => Object.hasOwn(indexPaths, index) && index !== missingIndex,
    },
    get: async (selectedKey: IDBValidKey) => {
      requests.push(`${name}.get`);
      if (name === 'sync_capture' && selectedKey !== 'profile')
        throw new Error('Capture value read is forbidden');
      if (name === 'sync_connection' && selectedKey !== 'connection')
        throw new Error('Credential reads are forbidden');
      if (typeof selectedKey !== 'string') throw new Error('Unexpected compound primary key');
      return table(name).get(selectedKey);
    },
    count: async (query?: unknown) => {
      requests.push(`${name}.count`);
      return [...table(name).keys()].filter((primary) => matches(primary, query)).length;
    },
    index: (index: string) => {
      if (!Object.hasOwn(indexPaths, index) || index === missingIndex)
        throw new DOMException('Missing index', 'NotFoundError');
      const entries = (query?: unknown) =>
        [...table(name)]
          .flatMap(([primaryKey, value]) => {
            if (!isRecord(value)) return [];
            const fields = indexPaths[index]!;
            const values = fields.map((field) => value[field]);
            const indexKey = fields.length === 1 ? values[0] : values;
            return key(indexKey) && matches(indexKey, query) ? [{ key: indexKey, primaryKey }] : [];
          })
          .sort((a, b) => compare(a.key, b.key) || compare(a.primaryKey, b.primaryKey));
      return {
        keyPath:
          index === malformedIndex
            ? ['wrong']
            : index === 'kind'
              ? 'kind'
              : [...indexPaths[index]!],
        count: async (query?: unknown) => {
          requests.push(`${name}.${index}.count`);
          return entries(query).length;
        },
        openKeyCursor: async (query?: unknown) => {
          requests.push(`${name}.${index}.openKeyCursor`);
          const first = entries(query)[0];
          return first
            ? {
                ...first,
                continue: async () => {
                  throw new Error('Unbounded cursor iteration');
                },
              }
            : null;
        },
      };
    },
  });
  const database = {
    transaction: vi.fn((names: string[], mode: string) => {
      if (closed) throw new DOMException('Closed handle', 'InvalidStateError');
      expect([...names].sort()).toEqual(['sync_capture', 'sync_connection', 'sync_outbox']);
      expect(mode).toBe('readonly');
      return {
        objectStore: store,
        get done() {
          complete();
          return completionFailure
            ? Promise.reject(new DOMException('Read transaction failed', 'AbortError'))
            : Promise.resolve();
        },
      };
    }),
  };
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: selected.profileCreatedAt,
    enabled: true,
    spaceId: selected.spaceId,
    connectionGeneration: selected.connectionGeneration,
  });
  table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...selected,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '44444444-4444-4444-8444-444444444444',
  });
  const connection = {
    ...selected,
    version: 1,
    kind: 'queue-connection',
    key: queueConnectionKey(selected),
    revision: 1,
    paused: false,
    scheduleProgress: null,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
    enrollmentProgress: { authorization, revision: 1, source: 'complete', afterKey: null },
  };
  table('sync_outbox').set(connection.key, connection);
  const capture = (id: string, phase: string = 'published', other: SyncQueueScope = selected) => {
    const row = {
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', id]),
      createdAt: 1,
      ...other,
      rootKind: 'media',
      rootId: id,
      rootKey: captureRootKey(other.spaceId, 'media', id),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      phase,
      sourceSha256: 'a'.repeat(64),
      source: { changeKind: 'tombstone', label: id },
      change: { kind: 'tombstone' },
    };
    table('sync_capture').set(row.key, row);
    return row;
  };
  const queue = (
    id: string,
    status: (typeof statuses)[number] = 'published',
    other: SyncQueueScope = selected
  ) => {
    const row = {
      ...other,
      version: 1,
      kind: 'queue-operation',
      key: queueOperationKey(other, id),
      operationId: id,
      captureKey: JSON.stringify(['change', id]),
      captureSha256: 'a'.repeat(64),
      rootKey: captureRootKey(other.spaceId, 'media', id),
      generation: 1,
      revision: 1,
      status,
      stage: status === 'published' ? 'published' : 'queued',
      runId: status === 'running' ? '66666666-6666-4666-8666-666666666666' : null,
      authorization,
      writeStarted: status === 'published',
      outcome: status === 'published' ? 'verified' : 'none',
      attemptId: null,
      failureCode: status === 'failed' ? 'secrets-locked' : null,
      nextDueAt: null,
      automaticRetryCount: 0,
      eventSequence: 0,
      pendingTransitions: [],
      droppedTransitions: 0,
    };
    table('sync_outbox').set(row.key, row);
    return row;
  };
  const pending = (id: string, dueAt: unknown, other: SyncQueueScope = selected) => {
    const rootKey = captureRootKey(other.spaceId, 'media', id);
    const row = {
      ...other,
      version: 1,
      kind: 'pending-checkpoint',
      key: pendingCheckpointKey(rootKey),
      createdAt: 1,
      rootKind: 'media',
      rootId: id,
      rootKey,
      revision: '55555555-5555-4555-8555-555555555555',
      dueAt,
    };
    table('sync_capture').set(row.key, row);
  };
  io.capture.mockReturnValue(database);
  return {
    database,
    rows,
    requests,
    table,
    capture,
    queue,
    pending,
    connection,
    close: () => {
      closed = true;
    },
    onDone: (effect: () => void) => {
      complete = effect;
    },
    failCompletion: () => {
      completionFailure = true;
    },
    corruptIndex: (name: string) => {
      malformedIndex = name;
    },
    omitIndex: (name: string) => {
      missingIndex = name;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', {
    bound: range,
    only: (value: IDBValidKey) => range(value, value),
    lowerBound: (value: IDBValidKey, open = false) => range(value, undefined, open),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('counts 10 and 1000 published operations with the same bounded request budget and no capture values', async () => {
  const budgets: string[][] = [];
  for (const size of [10, 1000]) {
    const f = fixture();
    for (let n = 0; n < size; n++) {
      f.capture(`operation-${n}`);
      f.queue(`operation-${n}`);
    }
    const before = structuredClone(f.rows);
    io.capture.mockClear();
    expect(await readSyncQueueSummary()).toMatchObject({
      knowledge: 'complete',
      configured: true,
      scope,
      authorization,
      connection: 'active',
      enrollmentComplete: true,
      localPublication: 'published',
      minimumPendingDueAt: null,
      counts: {
        pendingRoots: 0,
        nativeOperations: 0,
        preparedOperations: 0,
        publishedOperations: size,
        queue: {
          queued: 0,
          running: 0,
          paused: 0,
          cancelled: 0,
          failed: 0,
          interrupted: 0,
          published: size,
        },
      },
    });
    expect(f.rows).toEqual(before);
    expect(f.database.transaction).toHaveBeenCalledOnce();
    expect(io.capture).toHaveBeenCalledTimes(2);
    budgets.push(f.requests);
  }
  expect(budgets[1]).toEqual(budgets[0]);
  expect(io.open).not.toHaveBeenCalled();
});

it('includes a failed queue operation beyond one thousand published entries', async () => {
  const f = fixture();
  for (let n = 0; n < 1000; n++) {
    f.capture(`operation-${n}`);
    f.queue(`operation-${n}`);
  }
  f.capture('hidden-failure', 'native');
  f.queue('hidden-failure', 'failed');
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    localPublication: 'waiting',
    counts: {
      nativeOperations: 1,
      publishedOperations: 1000,
      queue: { failed: 1, published: 1000 },
    },
  });
});

it('counts all three capture phases, seven queue statuses and pending roots as separate units', async () => {
  const f = fixture();
  for (const phase of ['native', 'prepared', 'published']) f.capture(phase, phase);
  for (const status of statuses) f.queue(status, status);
  f.pending('later', 20);
  f.pending('earlier', 10);
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    localPublication: 'waiting',
    minimumPendingDueAt: 10,
    counts: {
      pendingRoots: 2,
      nativeOperations: 1,
      preparedOperations: 1,
      publishedOperations: 1,
      queue: {
        queued: 1,
        running: 1,
        paused: 1,
        cancelled: 1,
        failed: 1,
        interrupted: 1,
        published: 1,
      },
    },
  });
});

it('does not require queue reconciliation to reveal a new native operation', async () => {
  const f = fixture();
  f.capture('not-yet-discovered', 'native');
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    localPublication: 'waiting',
    counts: { nativeOperations: 1, queue: { queued: 0 } },
  });
});

it('keeps incomplete initial enrollment distinct from an empty published queue', async () => {
  const f = fixture();
  f.table('sync_outbox').set(f.connection.key, {
    ...f.connection,
    enrollmentProgress: { authorization, revision: 1, source: 'media', afterKey: null },
    captureProgress: { authorization, revision: 1, afterKey: null },
  });
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    enrollmentComplete: false,
    localPublication: 'discovering',
  });
});

it('excludes a different enrollment from current counts and minimum due time', async () => {
  const f = fixture();
  const foreign = { ...scope, connectionGeneration: 2 };
  f.capture('foreign', 'native', foreign);
  f.queue('foreign', 'failed', foreign);
  f.pending('foreign', 1, foreign);
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    localPublication: 'published',
    minimumPendingDueAt: null,
    counts: { pendingRoots: 0, nativeOperations: 0, queue: { failed: 0 } },
  });
});

it.each([1, Number.MAX_SAFE_INTEGER])(
  'rejects every indexed array due time at profile lifetime %s',
  async (profileCreatedAt) => {
    for (const dueAt of [[], ['bad'], [[]]]) {
      const f = fixture({ ...scope, profileCreatedAt });
      f.pending('corrupt', dueAt);
      expect(await readSyncQueueSummary()).toEqual({
        knowledge: 'unknown',
        reason: 'index-coverage',
      });
    }
  }
);

it.each(['kind', 'syncCaptureScopePhase', 'syncPendingScopeDue', 'syncQueueScopeStatus'])(
  'refuses a missing %s index',
  async (index) => {
    const f = fixture();
    f.omitIndex(index);
    expect(await readSyncQueueSummary()).toEqual({
      knowledge: 'unknown',
      reason: 'index-coverage',
    });
  }
);

it.each(['kind', 'phase', 'scope', 'status', 'due'])(
  'refuses incomplete index coverage for malformed %s metadata',
  async (field) => {
    const f = fixture();
    if (field === 'kind')
      f.table('sync_capture').set('corrupt', { key: 'corrupt', kind: 'unexpected' });
    if (field === 'phase') f.capture('corrupt', 'unexpected');
    if (field === 'scope') {
      const row = f.capture('corrupt');
      f.table('sync_capture').set(row.key, { ...row, spaceId: undefined });
    }
    if (field === 'status') {
      const row = f.queue('corrupt');
      f.table('sync_outbox').set(row.key, { ...row, status: 'unexpected' });
    }
    if (field === 'due') f.pending('corrupt', undefined);
    expect(await readSyncQueueSummary()).toEqual({
      knowledge: 'unknown',
      reason: 'index-coverage',
    });
  }
);

it.each(['profile', 'connection', 'queue-control'])(
  'refuses invalid compact %s metadata without repair',
  async (target) => {
    const f = fixture();
    if (target === 'profile') f.table('sync_capture').set('profile', {});
    if (target === 'connection') f.table('sync_connection').set('connection', {});
    if (target === 'queue-control') f.table('sync_outbox').set(f.connection.key, {});
    expect(await readSyncQueueSummary()).toEqual({ knowledge: 'unknown', reason: 'invalid-data' });
  }
);

it('reports no configured connection without opening storage', async () => {
  const f = fixture();
  f.table('sync_connection').clear();
  f.table('sync_capture').clear();
  expect(await readSyncQueueSummary()).toEqual({ knowledge: 'complete', configured: false });
});
it('reports unprepared and closed handles as unavailable without opening replacement storage', async () => {
  io.capture.mockReturnValue(null);
  expect(await readSyncQueueSummary()).toEqual({
    knowledge: 'unavailable',
    reason: 'not-prepared',
  });
  const f = fixture();
  f.close();
  expect(await readSyncQueueSummary()).toEqual({
    knowledge: 'unavailable',
    reason: 'storage-unavailable',
  });
  expect(io.open).not.toHaveBeenCalled();
});
it('discards a completed observation after prepared handle replacement', async () => {
  const f = fixture();
  f.onDone(() => io.capture.mockReturnValue(null));
  expect(await readSyncQueueSummary()).toEqual({
    knowledge: 'unavailable',
    reason: 'database-changed',
  });
  expect(f.database.transaction).toHaveBeenCalledOnce();
});
it('retains persisted local publication knowledge after a worker restart', async () => {
  const f = fixture();
  f.capture('accepted');
  f.queue('accepted');
  const before = await readSyncQueueSummary();
  io.capture.mockReset();
  io.capture.mockReturnValue(f.database);
  expect(await readSyncQueueSummary()).toEqual(before);
  expect(before).toMatchObject({ knowledge: 'complete', localPublication: 'published' });
});

it.each(['syncCaptureScopePhase', 'syncPendingScopeDue', 'syncQueueScopeStatus'])(
  'refuses incorrect %s key-path metadata',
  async (index) => {
    const f = fixture();
    f.corruptIndex(index);
    expect(await readSyncQueueSummary()).toEqual({
      knowledge: 'unknown',
      reason: 'index-coverage',
    });
  }
);
it('refuses a failed read transaction completion even after successful index queries', async () => {
  const f = fixture();
  f.failCompletion();
  expect(await readSyncQueueSummary()).toEqual({
    knowledge: 'unavailable',
    reason: 'storage-unavailable',
  });
});
it('uses the caller transaction for the browser projection helper without observing another handle', async () => {
  const f = fixture();
  f.pending('native-edit', 25);
  io.capture.mockClear();
  const tx = f.database.transaction(['sync_capture', 'sync_connection', 'sync_outbox'], 'readonly');
  expect(await readSyncQueueSummaryInTransaction(tx)).toMatchObject({
    knowledge: 'complete',
    configured: true,
    minimumPendingDueAt: 25,
    counts: { pendingRoots: 1 },
    localPublication: 'waiting',
  });
  await tx.done;
  expect(io.capture).not.toHaveBeenCalled();
  expect(io.open).not.toHaveBeenCalled();
});

it('keeps an absent queue control in discovery even when all operation indexes are empty', async () => {
  const f = fixture();
  f.table('sync_outbox').clear();
  expect(await readSyncQueueSummary()).toMatchObject({
    knowledge: 'complete',
    configured: true,
    enrollmentComplete: false,
    localPublication: 'discovering',
    counts: { pendingRoots: 0, nativeOperations: 0, preparedOperations: 0, publishedOperations: 0 },
  });
});

it('shares canonical pending key-only scope coverage and minimum deadline with page queries', async () => {
  const f = fixture();
  f.pending('later', 60000);
  f.pending('earlier', 1);
  f.pending('foreign', 0, { ...scope, profileCreatedAt: 9 });
  const tx = f.database.transaction(['sync_capture', 'sync_connection', 'sync_outbox'], 'readonly');
  expect(await readSyncPendingCheckpointSummaryInTransaction(tx, scope)).toEqual({
    pendingRoots: 2,
    minimumPendingDueAt: 1,
  });
  expect(f.requests.some((request) => request.endsWith('.get'))).toBe(false);
  expect(io.open).not.toHaveBeenCalled();
});
it.each([null, '60000', -1, 0.5])(
  'rejects an incomplete or noncanonical pending deadline %j in direct page summary',
  async (dueAt) => {
    const f = fixture();
    f.pending('invalid', dueAt);
    const tx = f.database.transaction(
      ['sync_capture', 'sync_connection', 'sync_outbox'],
      'readonly'
    );
    await expect(readSyncPendingCheckpointSummaryInTransaction(tx, scope)).rejects.toThrow();
    expect(f.requests.some((request) => request.endsWith('.get'))).toBe(false);
  }
);
