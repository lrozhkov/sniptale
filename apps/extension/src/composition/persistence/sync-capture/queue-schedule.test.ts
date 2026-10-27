import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { SyncConnectionIdentity } from '../remote-connection/model';
import {
  initializeSyncQueueSchedulePage,
  loadSyncQueueScheduleProgress,
  discoverDueSyncQueueOperations,
  deferDueSyncQueueOperation,
} from './queue-schedule';
import { advanceSyncQueueRun, beginSyncQueueRun } from './queue';
import { captureRootKey } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
import {
  queueConnectionKey,
  queueOperationKey,
  queueHash,
  parseSyncQueueOperation,
  parseSyncQueueConnection,
  type SyncQueueScope,
  type SyncQueueOperation,
} from './queue-model';
const io = vi.hoisted(() => ({ database: vi.fn(), capture: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
  capturePreparedDatabase: io.capture,
}));
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
const authorization: SyncConnectionIdentity = {
  incarnation: '22222222-2222-4222-8222-222222222222',
  revision: 1,
};
type NativeKey = IDBValidKey;
interface TestCursor {
  primaryKey: NativeKey;
  key: NativeKey;
  value: unknown;
  continue: () => Promise<TestCursor | null>;
}
interface Range {
  lower: NativeKey;
  upper: NativeKey;
  lowerOpen: boolean;
  upperOpen: boolean;
}
function nativeKey(value: unknown): value is NativeKey {
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  return Array.isArray(value) && value.every(nativeKey);
}
function keyRank(value: NativeKey): number {
  if (typeof value === 'number') return 0;
  if (value instanceof Date) return 1;
  if (typeof value === 'string') return 2;
  return Array.isArray(value) ? 4 : 3;
}
function keyBytes(value: NativeKey): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Invalid binary key.');
}
function compare(left: NativeKey, right: NativeKey): number {
  const rank = keyRank(left) - keyRank(right);
  if (rank) return rank;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      const result = compare(left[i]!, right[i]!);
      if (result) return result;
    }
    return left.length - right.length;
  }
  if (typeof left === 'number' && typeof right === 'number')
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === 'string' && typeof right === 'string')
    return left < right ? -1 : left > right ? 1 : 0;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  const leftBytes = keyBytes(left);
  const rightBytes = keyBytes(right);
  for (let i = 0; i < Math.min(leftBytes.length, rightBytes.length); i += 1) {
    const result = leftBytes[i]! - rightBytes[i]!;
    if (result) return result;
  }
  return leftBytes.length - rightBytes.length;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(100_000);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: NativeKey, upper: NativeKey, lowerOpen = false, upperOpen = false): Range => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
    only: (value: unknown) => {
      if (!nativeKey(value)) throw new DOMException('Invalid key', 'DataError');
      return { lower: value, upper: value, lowerOpen: false, upperOpen: false };
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  installPersistenceLockManagerForTests(null);
});
function fixture() {
  const rows = new Map<string, Map<NativeKey, unknown>>(
    ['sync_capture', 'sync_connection', 'sync_outbox'].map((name) => [name, new Map()])
  );
  const table = (name: string) => rows.get(name)!;
  const captureRead = vi.fn();
  const scanned = vi.fn();
  const abort = vi.fn();
  let failWrites = false;
  let closed = false;
  const database = {
    transaction(stores: string[], mode: string) {
      if (closed) throw new DOMException('Closed database', 'InvalidStateError');
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
          abort();
        },
        objectStore(name: string) {
          if (!stores.includes(name)) throw new Error('Store outside transaction scope');
          const values = pending.get(name)!;
          const openCursor = async (range: Range, index = false) => {
            const entries: { primaryKey: NativeKey; key: NativeKey; value: unknown }[] = [];
            for (const [primaryKey, value] of values) {
              let key: NativeKey = primaryKey;
              if (index) {
                if (
                  !isRecord(value) ||
                  !isRecord(value['authorization']) ||
                  typeof value['authorization']['incarnation'] !== 'string' ||
                  typeof value['spaceId'] !== 'string' ||
                  typeof value['connectionGeneration'] !== 'number' ||
                  typeof value['profileCreatedAt'] !== 'number' ||
                  typeof value['nextDueAt'] !== 'number' ||
                  !nativeKey(value['key'])
                )
                  continue;
                key = [
                  value['spaceId'],
                  value['connectionGeneration'],
                  value['profileCreatedAt'],
                  value['authorization']['incarnation'],
                  value['nextDueAt'],
                  value['key'],
                ];
              }
              if (
                (range.lowerOpen
                  ? compare(key, range.lower) > 0
                  : compare(key, range.lower) >= 0) &&
                (range.upperOpen ? compare(key, range.upper) < 0 : compare(key, range.upper) <= 0)
              )
                entries.push({ primaryKey, key, value });
            }
            entries.sort((a, b) => compare(a.key, b.key));
            const at = (position: number): TestCursor | null => {
              const item = entries[position];
              if (!item) return null;
              scanned(index ? 'index' : 'primary', item.primaryKey);
              return { ...structuredClone(item), continue: async () => at(position + 1) };
            };
            return at(0);
          };
          return {
            get: async (key: string) => {
              if (name === 'sync_capture') captureRead(key);
              return structuredClone(values.get(key));
            },
            put: async (value: unknown) => {
              if (failWrites) throw new DOMException('No space', 'QuotaExceededError');
              if (!isRecord(value) || !nativeKey(value['key']))
                throw new Error('Missing native key');
              values.set(value['key'], structuredClone(value));
            },
            openCursor: (range: Range) => openCursor(range),
            index: (indexName: string) => {
              expect(indexName).toBe('syncQueueDue');
              return { openCursor: (range: Range) => openCursor(range, true) };
            },
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') {
            rows.clear();
            for (const [name, values] of pending) rows.set(name, values);
          }
          return Promise.resolve();
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
  io.capture.mockReturnValue(database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const connection = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '44444444-4444-4444-8444-444444444444',
  };
  table('sync_connection').set('connection', connection);
  const operation = (id: string, extra: Partial<SyncQueueOperation> = {}) => {
    const capture = parseSyncCaptureRecord({
      version: 1,
      kind: 'captured-change',
      key: JSON.stringify(['change', id]),
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: 'root',
      rootKey: captureRootKey('space', 'media', 'root'),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    });
    if (!capture || capture.kind !== 'captured-change') throw new Error('Invalid capture fixture.');
    const row: SyncQueueOperation = {
      ...scope,
      version: 1,
      kind: 'queue-operation',
      key: queueOperationKey(scope, id),
      operationId: id,
      captureKey: capture.key,
      captureSha256: queueHash(JSON.stringify(capture)),
      rootKey: capture.rootKey,
      generation: 1,
      revision: 1,
      status: 'queued',
      stage: 'queued',
      runId: null,
      authorization,
      writeStarted: false,
      outcome: 'none',
      attemptId: null,
      failureCode: null,
      eventSequence: 0,
      pendingTransitions: [],
      droppedTransitions: 0,
      nextDueAt: 100_000,
      automaticRetryCount: 0,
      ...extra,
    };
    table('sync_capture').set(capture.key, capture);
    table('sync_outbox').set(row.key, structuredClone(row));
    return row;
  };
  return {
    rows,
    table,
    database,
    captureRead,
    scanned,
    abort,
    operation,
    connection,
    close() {
      closed = true;
    },
    failWrites(value: boolean) {
      failWrites = value;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function delayNextPermit() {
  const gate = deferred<void>();
  let first = true;
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => {
      if (first) {
        first = false;
        await gate.promise;
      }
      return operation({});
    },
  });
  return {
    release() {
      gate.resolve();
    },
  };
}
it('decodes paired legacy schedule fields and connection progress without writing', async () => {
  const f = fixture();
  const row = f.operation('old');
  const { nextDueAt, automaticRetryCount, ...legacy } = row;
  void nextDueAt;
  void automaticRetryCount;
  f.table('sync_outbox').set(row.key, legacy);
  expect(parseSyncQueueOperation(legacy)).toMatchObject({
    nextDueAt: null,
    automaticRetryCount: 0,
  });
  expect(parseSyncQueueOperation({ ...legacy, nextDueAt: null })).toBeNull();
  expect(parseSyncQueueOperation({ ...row, automaticRetryCount: 6 })).toBeNull();
  expect(parseSyncQueueOperation({ ...row, nextDueAt: Infinity })).toBeNull();
  const before = structuredClone(f.rows);
  expect(await loadSyncQueueScheduleProgress(scope, authorization)).toBeNull();
  expect(f.rows).toEqual(before);
});
it('initializes bounded primary pages without reading captures and retains malformed rows', async () => {
  const f = fixture();
  for (let i = 0; i < 67; i += 1) {
    const row = f.operation(String(i).padStart(3, '0'));
    const { nextDueAt, automaticRetryCount, ...legacy } = row;
    void nextDueAt;
    void automaticRetryCount;
    f.table('sync_outbox').set(row.key, legacy);
  }
  const malformedKey = queueOperationKey(scope, '000-bad');
  const malformed = { key: malformedKey, invalid: 'retained' };
  f.table('sync_outbox').set(malformedKey, malformed);
  const first = await initializeSyncQueueSchedulePage(scope, authorization, null);
  expect(first.complete).toBe(false);
  expect(f.scanned).toHaveBeenCalledTimes(64);
  expect(f.captureRead.mock.calls.every(([key]) => key === 'profile')).toBe(true);
  const second = await initializeSyncQueueSchedulePage(scope, authorization, first.revision);
  expect(second.complete).toBe(true);
  expect(f.table('sync_outbox').get(malformedKey)).toEqual(malformed);
  const connection = parseSyncQueueConnection(
    f.table('sync_outbox').get(queueConnectionKey(scope))
  )!;
  expect(connection.revision).toBe(0);
  expect(
    parseSyncQueueOperation(f.table('sync_outbox').get(queueOperationKey(scope, '066')))!.nextDueAt
  ).toBe(100_000);
});
it('advances past malformed due pages across restart and revisits earlier insertions', async () => {
  const f = fixture();
  for (let i = 0; i < 35; i += 1) {
    const row = f.operation(`bad-${String(i).padStart(2, '0')}`);
    f.table('sync_outbox').set(row.key, { ...row, captureSha256: 'corrupt' });
  }
  const valid = f.operation('valid');
  const beforeBad = structuredClone(f.table('sync_outbox').get(queueOperationKey(scope, 'bad-00')));
  const first = await discoverDueSyncQueueOperations(scope, authorization);
  expect(first.candidates).toEqual([]);
  expect(first.progress.dueAfter).not.toBeNull();
  expect(f.scanned).toHaveBeenCalledTimes(17);
  // Reopening changes the runtime handle while retaining only native progress.
  io.database.mockResolvedValue({ transaction: f.database.transaction });
  const second = await discoverDueSyncQueueOperations(scope, authorization);
  expect(second.candidates).toEqual([]);
  expect(second.progress.dueAfter!.key).not.toBe(first.progress.dueAfter!.key);
  f.operation('aaa-inserted');
  const third = await discoverDueSyncQueueOperations(scope, authorization);
  expect(third.candidates.map((candidate) => candidate.operationId)).toEqual([valid.operationId]);
  expect(third.progress.dueAfter).toBeNull();
  expect(
    (await discoverDueSyncQueueOperations(scope, authorization)).candidates[0]?.operationId
  ).toBe('aaa-inserted');
  expect(f.table('sync_outbox').get(queueOperationKey(scope, 'bad-00'))).toEqual(beforeBad);
  expect(f.captureRead.mock.calls.every(([key]) => key === 'profile')).toBe(true);
});
it('orders equal deadlines by native primary key and resets a continuation after a backward clock change', async () => {
  const f = fixture();
  const expected = Array.from(
    { length: 33 },
    (_, i) => f.operation(String(i).padStart(2, '0')).operationId
  );
  const seen: string[] = [];
  for (let i = 0; i < 3; i += 1)
    seen.push(
      ...(await discoverDueSyncQueueOperations(scope, authorization)).candidates.map(
        (candidate) => candidate.operationId
      )
    );
  expect(seen).toEqual(expected);
  await discoverDueSyncQueueOperations(scope, authorization);
  vi.spyOn(Date, 'now').mockReturnValue(90_000);
  expect((await discoverDueSyncQueueOperations(scope, authorization)).progress.dueAfter).toBeNull();
});
it('defers schedule metadata without invalidating a running callback or its original authorization', async () => {
  const f = fixture();
  const row = f.operation('running', {
    status: 'running',
    stage: 'preparing',
    runId: '11111111-1111-4111-8111-111111111111',
  });
  const rotated = { ...authorization, revision: 2 };
  f.table('sync_connection').set('connection', { ...f.connection, identity: rotated });
  await initializeSyncQueueSchedulePage(scope, rotated, null);
  const discovery = await discoverDueSyncQueueOperations(scope, rotated);
  const candidate = discovery.candidates[0]!;
  expect(candidate).toMatchObject({ authorization: rotated, runAuthorization: authorization });
  expect(await deferDueSyncQueueOperation(candidate)).toBe(true);
  const deferredRow = parseSyncQueueOperation(f.table('sync_outbox').get(row.key))!;
  expect(deferredRow).toMatchObject({
    revision: row.revision,
    authorization,
    runId: row.runId,
    nextDueAt: 130_000,
  });
  expect(await deferDueSyncQueueOperation(candidate)).toBe(false);
  // Restore the original authority to prove metadata deferral retained the exact run callback.
  f.table('sync_connection').set('connection', f.connection);
  expect(
    await advanceSyncQueueRun(
      {
        scope,
        operationId: row.operationId,
        revision: row.revision,
        runId: row.runId!,
        authorization,
      },
      'checking'
    )
  ).toMatchObject({ stage: 'checking' });
});
it('retains unbound legacy running authorization for explicit pilot recovery', async () => {
  const f = fixture();
  const row = f.operation('running', {
    status: 'running',
    runId: '11111111-1111-4111-8111-111111111111',
    authorization: null,
  });
  const { nextDueAt, automaticRetryCount, ...legacy } = row;
  void nextDueAt;
  void automaticRetryCount;
  f.table('sync_outbox').set(row.key, legacy);
  await initializeSyncQueueSchedulePage(scope, authorization, null);
  expect(parseSyncQueueOperation(f.table('sync_outbox').get(row.key))).toMatchObject({
    authorization: null,
    runId: row.runId,
  });
  expect((await discoverDueSyncQueueOperations(scope, authorization)).candidates).toEqual([]);
});
it('refuses stale initialization and delayed deferral after deletion and recreation', async () => {
  const f = fixture();
  f.operation('one');
  const initialized = await initializeSyncQueueSchedulePage(scope, authorization, null);
  await expect(initializeSyncQueueSchedulePage(scope, authorization, null)).rejects.toThrow(
    'Stale'
  );
  const candidate = (await discoverDueSyncQueueOperations(scope, authorization)).candidates[0]!;
  const gate = delayNextPermit();
  const pending = deferDueSyncQueueOperation(candidate);
  const refusal = expect(pending).rejects.toThrow('profile changed');
  f.table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 2,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  f.table('sync_outbox').clear();
  const before = structuredClone(f.rows);
  gate.release();
  await refusal;
  expect(f.rows).toEqual(before);
  expect(initialized.revision).toBe(1);
});
it('aborts and drains failed initialization before command retry', async () => {
  const f = fixture();
  const row = f.operation('one');
  const { nextDueAt, automaticRetryCount, ...legacy } = row;
  void nextDueAt;
  void automaticRetryCount;
  f.table('sync_outbox').set(row.key, legacy);
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(initializeSyncQueueSchedulePage(scope, authorization, null)).rejects.toThrow(
    'No space'
  );
  expect(f.abort).toHaveBeenCalledOnce();
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  expect((await initializeSyncQueueSchedulePage(scope, authorization, null)).complete).toBe(true);
});
it('refuses delayed due claims after pause, cancellation and connection replacement', async () => {
  const f = fixture();
  const row = f.operation('one');
  const candidate = (await discoverDueSyncQueueOperations(scope, authorization)).candidates[0]!;
  f.table('sync_outbox').set(row.key, { ...row, status: 'paused', revision: 2, nextDueAt: null });
  expect(await deferDueSyncQueueOperation(candidate)).toBe(false);
  await expect(
    beginSyncQueueRun(scope, row.operationId, candidate.revision, authorization)
  ).rejects.toThrow('refused');
  f.table('sync_outbox').set(row.key, {
    ...row,
    status: 'cancelled',
    revision: 2,
    nextDueAt: null,
  });
  expect(await deferDueSyncQueueOperation(candidate)).toBe(false);
  const replacement = { ...authorization, incarnation: '55555555-5555-4555-8555-555555555555' };
  f.table('sync_connection').set('connection', { ...f.connection, identity: replacement });
  await expect(deferDueSyncQueueOperation(candidate)).rejects.toThrow('refused');
  expect((await discoverDueSyncQueueOperations(scope, replacement)).candidates).toEqual([]);
});
it('fences a delayed initialization when another writer advances schedule progress', async () => {
  const f = fixture();
  f.operation('one');
  const gate = delayNextPermit();
  const delayed = initializeSyncQueueSchedulePage(scope, authorization, null);
  await initializeSyncQueueSchedulePage(scope, authorization, null);
  gate.release();
  await expect(delayed).rejects.toThrow('Stale');
});
it.each([0, 17, NaN, 1.5])('refuses invalid due limit %s before storage', async (limit) => {
  await expect(discoverDueSyncQueueOperations(scope, authorization, limit)).rejects.toThrow(
    'limit'
  );
  expect(io.database).not.toHaveBeenCalled();
});

it('captures prepared admission before waiting and cannot initialize an erased recreated database', async () => {
  const old = fixture();
  old.operation('one');
  const gate = delayNextPermit();
  const pending = initializeSyncQueueSchedulePage(scope, authorization, null);
  const refused = expect(pending).rejects.toThrow('Closed database');
  expect(io.capture).toHaveBeenCalledOnce();
  old.close();
  const replacement = fixture();
  replacement.operation('one');
  const before = structuredClone(replacement.rows);
  gate.release();
  await refused;
  expect(replacement.rows).toEqual(before);
  expect(io.database).not.toHaveBeenCalled();
});
it('advances native fractional deadline positions without admitting their malformed rows', async () => {
  const f = fixture();
  for (let i = 0; i < 35; i += 1) {
    const row = f.operation(`bad-${String(i).padStart(2, '0')}`);
    f.table('sync_outbox').set(row.key, { ...row, nextDueAt: 99_000.5 });
  }
  f.operation('valid');
  expect((await discoverDueSyncQueueOperations(scope, authorization)).candidates).toEqual([]);
  expect((await loadSyncQueueScheduleProgress(scope, authorization))!.dueAfter!.dueAt).toBe(
    99_000.5
  );
  expect((await discoverDueSyncQueueOperations(scope, authorization)).candidates).toEqual([]);
  expect(
    (await discoverDueSyncQueueOperations(scope, authorization)).candidates.map(
      (candidate) => candidate.operationId
    )
  ).toEqual(['valid']);
});
it('refuses cold mutation admission without opening the database', async () => {
  fixture();
  io.capture.mockReturnValue(null);
  await expect(initializeSyncQueueSchedulePage(scope, authorization, null)).rejects.toThrow(
    'not prepared'
  );
  expect(io.database).not.toHaveBeenCalled();
});

it('retains foreign due keys across bounded pages and permits later commands', async () => {
  const f = fixture();
  const raw = Array.from({ length: 17 }, (_, i) => {
    const row = {
      ...f.operation(`source-${i}`),
      key: `bad-${String(i).padStart(2, '0')}`,
      nextDueAt: 99_000,
    };
    f.table('sync_outbox').delete(queueOperationKey(scope, row.operationId));
    f.table('sync_outbox').set(row.key, row);
    return structuredClone(row);
  });
  const valid = f.operation('valid');
  const first = await discoverDueSyncQueueOperations(scope, authorization);
  expect(first.candidates).toEqual([]);
  expect(f.scanned).toHaveBeenCalledTimes(17);
  expect((await loadSyncQueueScheduleProgress(scope, authorization))!.dueAfter!.key).toBe('bad-15');
  io.capture.mockReturnValue({ transaction: f.database.transaction });
  f.scanned.mockClear();
  const second = await discoverDueSyncQueueOperations(scope, authorization);
  expect(second.candidates.map((candidate) => candidate.operationId)).toEqual(['valid']);
  expect(second.progress.dueAfter).toBeNull();
  expect(f.scanned.mock.calls.length).toBeLessThanOrEqual(17);
  for (const row of raw) expect(f.table('sync_outbox').get(row.key)).toEqual(row);
  expect(
    await beginSyncQueueRun(scope, valid.operationId, valid.revision, authorization)
  ).toMatchObject({ scope, operationId: valid.operationId, revision: valid.revision + 1 });
  expect(parseSyncQueueOperation(f.table('sync_outbox').get(valid.key))?.status).toBe('running');
});
it('resumes initialization after an oversized native string key', async () => {
  const f = fixture();
  const key = queueOperationKey(scope, 'a'.repeat(5000));
  const malformed = { key, invalid: 'preserved' };
  f.table('sync_outbox').set(key, malformed);
  const valid = f.operation('z-valid');
  const first = await initializeSyncQueueSchedulePage(scope, authorization, null, 1);
  expect(first.afterKey).toBe(key);
  expect(first.complete).toBe(false);
  expect(f.scanned).toHaveBeenCalledTimes(1);
  expect((await loadSyncQueueScheduleProgress(scope, authorization))!.afterKey).toBe(key);
  const second = await initializeSyncQueueSchedulePage(scope, authorization, first.revision, 1);
  expect(second.afterKey).toBe(valid.key);
  expect(
    (await initializeSyncQueueSchedulePage(scope, authorization, second.revision, 1)).complete
  ).toBe(true);
  expect(f.table('sync_outbox').get(key)).toEqual(malformed);
});
it.each([
  ['number', 7],
  ['date', new Date(7)],
  ['binary', new Uint8Array([7]).buffer],
  ['array', ['native', 7]],
  ['high string', '\uffff-after'],
  ['long string', 'x'.repeat(5000)],
] satisfies [string, NativeKey][])(
  'resumes native %s due keys and wraps without changing malformed rows',
  async (_label, key) => {
    const f = fixture();
    const source = f.operation('source');
    f.table('sync_outbox').delete(source.key);
    const malformed = { ...source, key, nextDueAt: 99_000.5 };
    f.table('sync_outbox').set(key, malformed);
    f.operation('valid');
    const first = await discoverDueSyncQueueOperations(scope, authorization, 1);
    expect(first.candidates).toEqual([]);
    expect(first.progress.dueAfter).toEqual({ dueAt: 99_000.5, key });
    expect(f.scanned).toHaveBeenCalledTimes(2);
    expect((await loadSyncQueueScheduleProgress(scope, authorization))!.dueAfter).toEqual(
      first.progress.dueAfter
    );
    io.capture.mockReturnValue({ transaction: f.database.transaction });
    f.scanned.mockClear();
    const second = await discoverDueSyncQueueOperations(scope, authorization, 1);
    expect(second.candidates.map((candidate) => candidate.operationId)).toEqual(['valid']);
    expect(second.progress.dueAfter).toBeNull();
    expect(f.scanned).toHaveBeenCalledTimes(1);
    expect(
      (await discoverDueSyncQueueOperations(scope, authorization, 1)).progress.dueAfter
    ).toEqual(first.progress.dueAfter);
    expect(
      [...f.table('sync_outbox').values()].filter(
        (value) => isRecord(value) && value['operationId'] === 'source'
      )
    ).toEqual([malformed]);
  }
);
it('includes every native key at the deadline and stops before a fractional future deadline', async () => {
  const f = fixture();
  const source = f.operation('source');
  f.table('sync_outbox').delete(source.key);
  const malformed = { ...source, key: ['after-all-strings'], nextDueAt: 100_000 };
  f.table('sync_outbox').set(malformed.key, malformed);
  const future = f.operation('future', { nextDueAt: 100_000.5 });
  const valid = f.operation('valid');
  const first = await discoverDueSyncQueueOperations(scope, authorization, 1);
  expect(first.candidates.map((candidate) => candidate.operationId)).toEqual([valid.operationId]);
  expect(first.progress.dueAfter).not.toBeNull();
  const second = await discoverDueSyncQueueOperations(scope, authorization, 1);
  expect(second.candidates).toEqual([]);
  expect(second.progress.dueAfter).toBeNull();
  expect([...f.table('sync_outbox').values()]).toContainEqual(malformed);
  expect(f.table('sync_outbox').get(future.key)).toEqual(future);
});
