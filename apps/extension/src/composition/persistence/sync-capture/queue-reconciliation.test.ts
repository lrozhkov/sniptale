import {
  scope,
  authorization,
  deferred,
  withoutCaptureProgress,
  progress,
  createReconciliationFixture,
  installReconciliationKeyRanges,
} from './queue-reconciliation.test-support';
import { reconcileSyncQueueCaptures } from './queue-reconciliation';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { captureRootKey } from './contracts';
import {
  beginSyncQueueRun,
  commandSyncQueue,
  commandSyncQueueOperation,
  failSyncQueueRun,
} from './queue';
import {
  queueConnectionKey,
  queueOperationKey,
  parseSyncQueueConnection,
  recordQueueTransition,
} from './queue-model';

const io = vi.hoisted(() => ({ prepared: vi.fn(), initialize: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
  initDB: io.initialize,
}));
function setup() {
  const fixture = createReconciliationFixture();
  io.prepared.mockReturnValue(fixture.database);
  io.initialize.mockResolvedValue(fixture.database);
  return fixture;
}
beforeEach(() => {
  vi.clearAllMocks();
  installReconciliationKeyRanges();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network');
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reconciles retained captures idempotently without changing sources or using network', async () => {
  const f = setup();
  f.capture('media');
  f.capture('project');
  const sources = structuredClone(f.table('sync_capture'));
  const suppliedScope = structuredClone(scope);
  const suppliedAuthorization = structuredClone(authorization);
  const pending = reconcileSyncQueueCaptures(suppliedScope, suppliedAuthorization);
  suppliedScope.profileCreatedAt = 9;
  suppliedAuthorization.revision = 9;
  expect(await pending).toEqual({ enqueued: 2, existing: 0, refused: 0 });
  const rows = structuredClone(f.rows);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 2,
    refused: 0,
  });
  expect(withoutCaptureProgress(f.rows)).toEqual(withoutCaptureProgress(rows));
  expect(progress(f)?.revision).toBe(2);
  expect(f.table('sync_capture')).toEqual(sources);
  expect(io.initialize).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['scope', 'authorization', 'disabled', 'paused', 'missing'] as const)(
  'refuses reconciliation with changed %s authority',
  async (kind) => {
    const f = setup();
    f.capture('op');
    if (kind === 'scope') f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
    if (kind === 'authorization')
      f.table('sync_connection').set('connection', {
        ...f.connection,
        identity: { ...authorization, revision: 2 },
      });
    if (kind === 'disabled')
      f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
    if (kind === 'paused')
      f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
    if (kind === 'missing') f.table('sync_connection').delete('connection');
    const before = structuredClone(f.rows);
    await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
    expect(withoutCaptureProgress(f.rows)).toEqual(withoutCaptureProgress(before));
  }
);
it.each(['paused', 'failed'] as const)(
  'preserves %s controls deadlines and complete history on duplicate admission',
  async (status) => {
    const f = setup();
    f.capture('op');
    await reconcileSyncQueueCaptures(scope, authorization);
    if (status === 'paused') await commandSyncQueueOperation(scope, 'op', 1, 'pause');
    else {
      const run = await beginSyncQueueRun(scope, 'op', 1, authorization);
      await failSyncQueueRun(run, 'temporary');
    }
    await commandSyncQueue(scope, 1, 'pause');
    const before = structuredClone(f.rows);
    expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
      enqueued: 0,
      existing: 1,
      refused: 0,
    });
    expect(withoutCaptureProgress(f.rows)).toEqual(withoutCaptureProgress(before));
  }
);
it('does not let malformed captures suppress independent valid captures', async () => {
  const f = setup();
  const bad = f.capture('bad');
  f.table('sync_capture').set(bad.key, { ...bad, version: 999 });
  f.capture('valid');
  const before = structuredClone(f.table('sync_capture'));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 1,
  });
  expect(f.table('sync_outbox').has(queueOperationKey(scope, 'valid'))).toBe(true);
  expect(f.table('sync_capture')).toEqual(before);
});
it('refuses nonstring native primary keys while admitting independent string keys', async () => {
  const f = setup();
  const valid = f.capture('valid');
  const original = f.database.transaction.bind(f.database);
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (mode !== 'readonly') return tx;
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture') {
        vi.spyOn(store, 'getAllKeys').mockResolvedValue([valid.key, ['unexpected']]);
      }
      return store;
    });
    return tx;
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 1,
  });
  expect(f.table('sync_outbox').has(queueOperationKey(scope, 'valid'))).toBe(true);
});
it('refuses changed retained capture joins without repairing existing queue evidence', async () => {
  const f = setup();
  const row = f.capture('op');
  await reconcileSyncQueueCaptures(scope, authorization);
  f.table('sync_capture').set(row.key, { ...row, createdAt: 2 });
  const before = structuredClone(f.rows);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 0,
    refused: 1,
  });
  expect(withoutCaptureProgress(f.rows)).toEqual(withoutCaptureProgress(before));
});
it('bounds discovery to 65 primary keys and 64 distinct metadata bodies per pass', async () => {
  const f = setup();
  for (let index = 0; index < 140; index += 1) f.capture(`op-${String(index).padStart(3, '0')}`);
  const keyReads: { query: unknown; count: number | undefined }[] = [];
  const bodyReads = new Set<IDBValidKey>();
  const original = f.database.transaction.bind(f.database);
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture') {
        const get = store.get;
        vi.spyOn(store, 'get').mockImplementation((key) => {
          if (key !== 'profile') bodyReads.add(key);
          return get(key);
        });
        const getAllKeys = store.getAllKeys;
        vi.spyOn(store, 'getAllKeys').mockImplementation((query, count) => {
          keyReads.push({ query, count });
          return getAllKeys(query, count);
        });
      }
      return store;
    });
    return tx;
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 64,
    existing: 0,
    refused: 0,
  });
  expect(keyReads).toEqual([{ query: undefined, count: 65 }]);
  expect(bodyReads.size).toBe(64);
  const afterKey = JSON.stringify(['change', 'op-063']);
  expect(progress(f)).toEqual({ authorization, revision: 1, afterKey });
  bodyReads.clear();
  await reconcileSyncQueueCaptures(scope, authorization);
  expect(keyReads[1]).toEqual({
    query: { lower: afterKey, lowerOpen: true, upper: undefined, upperOpen: false },
    count: 65,
  });
  expect(bodyReads.size).toBe(64);
});
it('retains completed admissions after a later write failure and retries only missing work', async () => {
  const f = setup();
  f.capture('first');
  f.capture('second');
  f.capture('third');
  const original = f.database.transaction.bind(f.database);
  let writes = 0;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    if (mode === 'readwrite' && ++writes === 2) f.failAfterOneWrite();
    return original(stores, mode);
  });
  const sources = structuredClone(f.table('sync_capture'));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 2,
    existing: 0,
    refused: 1,
  });
  const first = structuredClone(f.table('sync_outbox').get(queueOperationKey(scope, 'first')));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 2,
    refused: 0,
  });
  expect(f.table('sync_outbox').get(queueOperationKey(scope, 'first'))).toEqual(first);
  expect(f.table('sync_capture')).toEqual(sources);
});
it.each(['profile', 'authorization', 'disabled'] as const)(
  'rechecks %s between item transactions and preserves earlier admissions',
  async (kind) => {
    const f = setup();
    f.capture('first');
    f.capture('second');
    const original = f.database.transaction.bind(f.database);
    let writes = 0;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && ++writes === 2) {
        if (kind === 'profile')
          f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
        if (kind === 'disabled')
          f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
        if (kind === 'authorization')
          f.table('sync_connection').set('connection', {
            ...f.connection,
            identity: { ...authorization, revision: 2 },
          });
      }
      return original(stores, mode);
    });
    await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
    expect(progress(f)).toBeUndefined();
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'first'))).toBe(true);
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'second'))).toBe(false);
  }
);
it.each(['profile', 'database'] as const)(
  'refuses delayed reconciliation after %s erasure and recreation',
  async (kind) => {
    const f = setup();
    f.capture('op');
    const entered = deferred();
    const release = deferred();
    const blocker = runWithExclusivePersistenceMutationPermit(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const pending = reconcileSyncQueueCaptures(scope, authorization);
    const refusal = expect(pending).rejects.toThrow();
    let replacement: ReturnType<typeof createReviewWorkspaceStoreFixture> | null = null;
    if (kind === 'profile') f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
    else {
      replacement = createReviewWorkspaceStoreFixture(() => false);
      replacement.rows.clear();
      for (const [name, values] of structuredClone(f.rows)) replacement.rows.set(name, values);
      io.prepared.mockReturnValue(replacement.database);
      io.initialize.mockResolvedValue(replacement.database);
      vi.spyOn(f.database, 'transaction').mockImplementation(() => {
        throw new DOMException('Closed database', 'InvalidStateError');
      });
    }
    const before = structuredClone(f.rows);
    release.resolve();
    await blocker;
    await refusal;
    expect(withoutCaptureProgress(f.rows)).toEqual(withoutCaptureProgress(before));
    if (replacement) expect(replacement.rows).toEqual(before);
    expect(io.prepared).toHaveBeenCalledTimes(1);
    expect(io.initialize).not.toHaveBeenCalled();
  }
);
it('refuses cold storage and invalid detached inputs without initializing a database', async () => {
  setup();
  io.prepared.mockReturnValue(null);
  await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
  await expect(reconcileSyncQueueCaptures({}, authorization)).rejects.toThrow();
  await expect(reconcileSyncQueueCaptures(scope, {})).rejects.toThrow();
  expect(io.initialize).not.toHaveBeenCalled();
});

it('resumes retained discovery after restart beyond 128 captures and wraps for earlier insertions', async () => {
  const f = setup();
  for (let index = 0; index < 140; index += 1) f.capture(`op-${String(index).padStart(3, '0')}`);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 64,
    existing: 0,
    refused: 0,
  });
  const firstProgress = structuredClone(progress(f));
  const replacement = createReviewWorkspaceStoreFixture(() => false);
  replacement.rows.clear();
  for (const [name, values] of structuredClone(f.rows)) replacement.rows.set(name, values);
  io.prepared.mockReturnValue(replacement.database);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 64,
    existing: 0,
    refused: 0,
  });
  expect(firstProgress?.afterKey).toBe(JSON.stringify(['change', 'op-063']));
  expect(
    parseSyncQueueConnection(replacement.rows.get('sync_outbox')!.get(queueConnectionKey(scope)))
      ?.captureProgress
  ).toMatchObject({ revision: 2, afterKey: JSON.stringify(['change', 'op-127']) });
  const earlier = f.capture('earlier');
  replacement.rows.get('sync_capture')!.set(earlier.key, earlier);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 12,
    existing: 0,
    refused: 0,
  });
  expect(
    parseSyncQueueConnection(replacement.rows.get('sync_outbox')!.get(queueConnectionKey(scope)))
      ?.captureProgress
  ).toMatchObject({ revision: 3, afterKey: null });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 63,
    refused: 0,
  });
  expect(replacement.rows.get('sync_outbox')!.has(queueOperationKey(scope, 'earlier'))).toBe(true);
});

it.each(['existing', 'paused', 'refused'] as const)(
  'advances beyond a full first page of %s captures without starving late keys',
  async (kind) => {
    const f = setup();
    const first = Array.from({ length: 64 }, (_, index) =>
      f.capture(`a-${String(index).padStart(3, '0')}`)
    );
    f.capture('z-late');
    if (kind === 'refused') {
      for (const row of first) f.table('sync_capture').set(row.key, { ...row, version: 999 });
    } else {
      await reconcileSyncQueueCaptures(scope, authorization);
      if (kind === 'paused') {
        for (const row of first)
          await commandSyncQueueOperation(scope, row.operationId, 1, 'pause');
      }
      const connection = parseSyncQueueConnection(
        f.table('sync_outbox').get(queueConnectionKey(scope))
      )!;
      f.table('sync_outbox').set(connection.key, {
        ...connection,
        captureProgress: { ...connection.captureProgress, afterKey: null },
      });
    }
    const result = await reconcileSyncQueueCaptures(scope, authorization);
    expect(result).toEqual({
      enqueued: 0,
      existing: kind === 'refused' ? 0 : 64,
      refused: kind === 'refused' ? 64 : 0,
    });
    expect(progress(f)?.afterKey).toBe(first[63]!.key);
    expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
      enqueued: 1,
      existing: 0,
      refused: 0,
    });
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'z-late'))).toBe(true);
    expect(progress(f)?.afterKey).toBeNull();
    if (kind === 'refused') {
      for (const row of first) f.table('sync_capture').set(row.key, row);
      expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
        enqueued: 64,
        existing: 0,
        refused: 0,
      });
    }
  }
);

it('counts all physical rows and advances past malformed rows omitted by the kind index', async () => {
  const f = setup();
  for (let index = 0; index < 64; index += 1)
    f.table('sync_capture').set(`!malformed-${String(index).padStart(3, '0')}`, { invalid: true });
  f.capture('late');
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 0,
    refused: 64,
  });
  expect(progress(f)?.afterKey).toBe('!malformed-063');
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 0,
  });
  expect(progress(f)?.afterKey).toBeNull();
});

it('persists native nonstring continuation keys and resumes their native range', async () => {
  const f = setup();
  f.capture('late');
  const original = f.database.transaction.bind(f.database);
  const ranges: unknown[] = [];
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture' && mode === 'readonly') {
        const getAllKeys = store.getAllKeys;
        vi.spyOn(store, 'getAllKeys').mockImplementation(async (query, count) => {
          ranges.push(query);
          if (query === undefined) return Array.from({ length: 65 }, (_, index) => index);
          return getAllKeys(query, count);
        });
      }
      return store;
    });
    return tx;
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 0,
    refused: 64,
  });
  expect(progress(f)?.afterKey).toBe(63);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 0,
  });
  expect(ranges[1]).toMatchObject({ lower: 63, lowerOpen: true });
  expect(progress(f)?.afterKey).toBeNull();
});

it('preserves prior continuation and committed admissions when the final progress write fails', async () => {
  const f = setup();
  for (let index = 0; index < 130; index += 1) f.capture(`op-${String(index).padStart(3, '0')}`);
  await reconcileSyncQueueCaptures(scope, authorization);
  const previous = structuredClone(progress(f));
  const original = f.database.transaction.bind(f.database);
  let writes = 0;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    if (mode === 'readwrite' && ++writes === 65) f.failNextProgressWrite();
    return original(stores, mode);
  });
  await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(progress(f)).toEqual(previous);
  expect(f.table('sync_outbox').has(queueOperationKey(scope, 'op-127'))).toBe(true);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 64,
    refused: 0,
  });
  expect(progress(f)).toMatchObject({
    revision: 2,
    afterKey: JSON.stringify(['change', 'op-127']),
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 2,
    existing: 0,
    refused: 0,
  });
});

it('keeps newer progress when a controlled parallel pass finishes from an older discovery snapshot', async () => {
  const f = setup();
  for (let index = 0; index < 130; index += 1) f.capture(`op-${String(index).padStart(3, '0')}`);
  const entered = deferred();
  const release = deferred();
  const original = f.database.transaction.bind(f.database);
  let discoveries = 0;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (mode !== 'readonly' || ++discoveries !== 1) return tx;
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture') {
        const getAllKeys = store.getAllKeys;
        vi.spyOn(store, 'getAllKeys').mockImplementation(async (query, count) => {
          const keys = await getAllKeys(query, count);
          entered.resolve();
          await release.promise;
          return keys;
        });
      }
      return store;
    });
    return tx;
  });
  const delayed = reconcileSyncQueueCaptures(scope, authorization);
  await entered.promise;
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 64,
    existing: 0,
    refused: 0,
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 64,
    existing: 0,
    refused: 0,
  });
  const newer = structuredClone(progress(f));
  const accepted = structuredClone(f.table('sync_outbox'));
  release.resolve();
  expect(await delayed).toEqual({ enqueued: 0, existing: 64, refused: 0 });
  expect(progress(f)).toEqual(newer);
  expect(f.table('sync_outbox')).toEqual(accepted);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 2,
    existing: 0,
    refused: 0,
  });
});

it('starts a fresh scan under changed current authorization without resetting its progress revision', async () => {
  const f = setup();
  for (let index = 0; index < 70; index += 1) f.capture(`op-${String(index).padStart(3, '0')}`);
  await reconcileSyncQueueCaptures(scope, authorization);
  const nextAuthorization = { ...authorization, revision: 2 };
  f.table('sync_connection').set('connection', { ...f.connection, identity: nextAuthorization });
  expect(await reconcileSyncQueueCaptures(scope, nextAuthorization)).toEqual({
    enqueued: 0,
    existing: 64,
    refused: 0,
  });
  expect(progress(f)).toEqual({
    authorization: nextAuthorization,
    revision: 2,
    afterKey: JSON.stringify(['change', 'op-063']),
  });
});

it('skips valid noncapture metadata and refuses foreign captures without suppressing the scan', async () => {
  const f = setup();
  const foreign = f.capture('foreign');
  f.table('sync_capture').set(foreign.key, {
    ...foreign,
    spaceId: 'elsewhere',
    rootKey: captureRootKey('elsewhere', 'media', 'foreign'),
  });
  f.capture('valid');
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 1,
  });
  expect(progress(f)?.afterKey).toBeNull();
});

it('parses legacy queue connections without adding capture progress', async () => {
  const f = setup();
  f.capture('op');
  await reconcileSyncQueueCaptures(scope, authorization);
  const connection = parseSyncQueueConnection(
    f.table('sync_outbox').get(queueConnectionKey(scope))
  )!;
  const { captureProgress: ignored, ...legacy } = connection;
  void ignored;
  expect(parseSyncQueueConnection(legacy)).toEqual(legacy);
  expect(Object.hasOwn(parseSyncQueueConnection(legacy)!, 'captureProgress')).toBe(false);
});

it.each([
  null,
  undefined,
  {},
  { authorization, revision: 0, afterKey: null },
  { authorization, revision: -1, afterKey: null },
  { authorization, revision: Number.MAX_SAFE_INTEGER + 1, afterKey: null },
  { authorization: {}, revision: 1, afterKey: null },
  { authorization, revision: 1, afterKey: {} },
  { authorization, revision: 1, afterKey: NaN },
])(
  'refuses malformed persisted capture progress without repairing evidence: %j',
  async (captureProgress) => {
    const f = setup();
    f.capture('op');
    await reconcileSyncQueueCaptures(scope, authorization);
    const connection = parseSyncQueueConnection(
      f.table('sync_outbox').get(queueConnectionKey(scope))
    )!;
    const invalid = { ...connection, captureProgress };
    f.table('sync_outbox').set(connection.key, invalid);
    expect(parseSyncQueueConnection(invalid)).toBeNull();
    const before = structuredClone(f.rows);
    await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow(
      'Invalid sync queue connection'
    );
    expect(f.rows).toEqual(before);
  }
);

it('merges final capture progress with the latest controls history and schedule progress', async () => {
  const f = setup();
  f.capture('op');
  await reconcileSyncQueueCaptures(scope, authorization);
  const original = f.database.transaction.bind(f.database);
  let writes = 0;
  let latest: unknown;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    if (mode === 'readwrite' && ++writes === 3) {
      const connection = parseSyncQueueConnection(
        f.table('sync_outbox').get(queueConnectionKey(scope))
      )!;
      latest = recordQueueTransition(
        {
          ...connection,
          revision: connection.revision + 1,
          paused: true,
          scheduleProgress: {
            authorization,
            revision: 7,
            afterKey: null,
            complete: false,
            dueAfter: null,
          },
        },
        'paused'
      );
      f.table('sync_outbox').set(connection.key, latest);
    }
    return original(stores, mode);
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 1,
    refused: 0,
  });
  expect(f.table('sync_outbox').get(queueConnectionKey(scope))).toEqual({
    ...parseSyncQueueConnection(latest),
    captureProgress: { authorization, revision: 2, afterKey: null },
  });
});

it.each(['profile', 'authorization', 'disabled'] as const)(
  'rechecks %s in the final progress transaction after successful admissions',
  async (kind) => {
    const f = setup();
    f.capture('op');
    const original = f.database.transaction.bind(f.database);
    let writes = 0;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && ++writes === 3) {
        if (kind === 'profile')
          f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
        if (kind === 'disabled')
          f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
        if (kind === 'authorization')
          f.table('sync_connection').set('connection', {
            ...f.connection,
            identity: { ...authorization, revision: 2 },
          });
      }
      return original(stores, mode);
    });
    await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'op'))).toBe(true);
    expect(progress(f)).toBeUndefined();
  }
);

it('records an empty physical scan without changing queue command revisions or history', async () => {
  const f = setup();
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 0,
    refused: 0,
  });
  expect(
    parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))
  ).toMatchObject({
    revision: 0,
    eventSequence: 0,
    droppedTransitions: 0,
    pendingTransitions: [],
    paused: false,
    captureProgress: { authorization, revision: 1, afterKey: null },
  });
});
