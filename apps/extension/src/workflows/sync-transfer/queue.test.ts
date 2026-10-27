import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../../composition/persistence/review-workspaces/store.test-support';
import {
  captureRootKey,
  type CapturedChange,
} from '../../composition/persistence/sync-capture/contracts';
import {
  advanceSyncQueueRun,
  beginSyncQueueRun,
  commandSyncQueue,
  commandSyncQueueOperation,
  enqueueSyncQueueOperation,
  loadSyncQueue,
  type SyncQueueScope,
} from '../../composition/persistence/sync-capture/queue';
import { loadPreparedOutgoingOperation } from '../../composition/persistence/sync-capture/outgoing';
import { loadVerifiedOutgoingResult } from '../../composition/persistence/sync-capture/outgoing-results';
import { scanSyncCatalog } from './catalog';
import { dispatchPreparedOutgoing, prepareCapturedOutgoing } from './outgoing';
import { recoverInterruptedSyncQueueOperation, runSyncQueueOperation } from './queue';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { SyncWorkspaceError, verifySyncWorkspaceIdentity } from './workspace';
import {
  encodeSyncWorkspaceMarker,
  SYNC_WORKSPACE_MARKER_KEY,
} from '../../contracts/sync-workspace';
import { createSyncAttempt } from './wire-record';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.database,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function liveLocks() {
  const active = new Map<string, { mode: 'exclusive' | 'shared'; count: number }>();
  const waiting = new Map<string, (() => void)[]>();
  return {
    async request<T>(
      name: string,
      options: { mode: 'exclusive' | 'shared'; ifAvailable?: boolean },
      callback: (lock: { name: string; mode: 'exclusive' | 'shared' } | null) => T | Promise<T>
    ): Promise<T> {
      let held = active.get(name);
      while (held && (held.mode === 'exclusive' || options.mode === 'exclusive')) {
        if (options.ifAvailable) return callback(null);
        const gate = deferred<void>();
        const listeners = waiting.get(name) ?? [];
        listeners.push(() => gate.resolve());
        waiting.set(name, listeners);
        await gate.promise;
        held = active.get(name);
      }
      const lease = held ?? { mode: options.mode, count: 0 };
      lease.count++;
      active.set(name, lease);
      try {
        return await callback({ name, mode: options.mode });
      } finally {
        lease.count--;
        if (lease.count === 0) {
          active.delete(name);
          const listeners = waiting.get(name) ?? [];
          waiting.delete(name);
          for (const notify of listeners) notify();
        }
      }
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) });
  vi.stubGlobal('navigator', { locks: liveLocks() });
});
afterEach(() => vi.unstubAllGlobals());

const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
function setup() {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  io.database.mockResolvedValue(fixture.database);
  const table = (name: string) => fixture.rows.get(name)!;
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: scope.spaceId,
    connectionGeneration: scope.connectionGeneration,
  });
  function capture(operationId = 'operation'): CapturedChange {
    const rootId = `root-${operationId}`;
    const value: CapturedChange = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', operationId]),
      createdAt: 2,
      spaceId: scope.spaceId,
      connectionGeneration: scope.connectionGeneration,
      rootKind: 'media',
      rootId,
      rootKey: captureRootKey(scope.spaceId, 'media', rootId),
      generation: 1,
      operationId,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    });
    table('sync_capture').set(value.key, structuredClone(value));
    return value;
  }
  table('asset_owners').set('retained-claim', {
    ownerKind: 'sync-capture',
    ownerId: 'retained-operation',
    role: 'source',
    assetId: 'original',
  });
  const nativeSources = () => {
    const snapshot = structuredClone(
      new Map([...fixture.rows].filter(([name]) => name !== 'sync_outbox'))
    );
    const captures = snapshot.get('sync_capture')!;
    for (const [key, raw] of captures) {
      const parsed = parseSyncCaptureRecord(raw);
      if (!parsed) throw new Error('Invalid native test evidence.');
      if (parsed.kind === 'sync-operation')
        captures.set(
          key,
          Object.fromEntries(
            Object.entries(parsed).filter(
              ([field]) =>
                !['phase', 'change', 'prepared', 'publication', 'objects'].includes(field)
            )
          )
        );
    }
    return snapshot;
  };
  return { ...fixture, table, capture, nativeSources };
}

function memoryRemote() {
  const bodies = new Map<string, Blob>();
  const calls: { method: 'list' | 'stat' | 'read' | 'write'; key: string }[] = [];
  let lostResponse = false;
  let onWrite: (() => Promise<void>) | undefined;
  const adapter: SyncRemoteStore = {
    async list(prefix) {
      calls.push({ method: 'list', key: prefix });
      return {
        objects: [...bodies]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, body]) => ({ key, size: body.size })),
        prefixes: [],
        nextCursor: null,
      };
    },
    async stat(key) {
      calls.push({ method: 'stat', key });
      const body = bodies.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return { size: body.size };
    },
    async read(key) {
      calls.push({ method: 'read', key });
      const body = bodies.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return body.stream();
    },
    async write(key, body) {
      calls.push({ method: 'write', key });
      bodies.set(key, body);
      await onWrite?.();
      if (lostResponse) {
        lostResponse = false;
        throw new SyncRemoteError('transport');
      }
    },
  };
  return {
    adapter,
    bodies,
    calls,
    writes: () => calls.filter(({ method }) => method === 'write').map(({ key }) => key),
    loseNextResponse() {
      lostResponse = true;
    },
    holdNextWrite() {
      const issued = deferred<void>();
      const release = deferred<void>();
      onWrite = async () => {
        onWrite = undefined;
        issued.resolve();
        await release.promise;
      };
      return { issued: issued.promise, release: () => release.resolve() };
    },
  };
}

function execute(
  capture: CapturedChange,
  remote: SyncRemoteStore,
  expectedRevision = 1,
  extra: Partial<Pick<Parameters<typeof runSyncQueueOperation>[0], 'catalog' | 'authorize'>> = {}
) {
  return runSyncQueueOperation({
    scope,
    operationId: capture.operationId,
    expectedRevision,
    remote,
    signal: new AbortController().signal,
    authorize: async () => undefined,
    ...extra,
  });
}
async function current(operationId = 'operation') {
  const row = (await loadSyncQueue(scope)).operations.find(
    (item) => item.operationId === operationId
  );
  if (!row) throw new Error('Missing test queue operation.');
  return row;
}

it('keeps a live operation busy for both another runner and recovery until its callback settles', async () => {
  const f = setup();
  const capture = f.capture();
  await enqueueSyncQueueOperation(capture);
  const source = f.nativeSources();
  const remote = memoryRemote();
  const held = remote.holdNextWrite();
  const running = execute(capture, remote.adapter);
  await held.issued;
  const row = await current();
  const calls = structuredClone(remote.calls);
  await expect(execute(capture, remote.adapter, row.revision)).resolves.toEqual({ status: 'busy' });
  await expect(
    recoverInterruptedSyncQueueOperation(scope, capture.operationId, row.revision)
  ).resolves.toEqual({ status: 'busy' });
  const reorderedScope: SyncQueueScope = {
    profileCreatedAt: scope.profileCreatedAt,
    connectionGeneration: scope.connectionGeneration,
    spaceId: scope.spaceId,
  };
  await expect(
    runSyncQueueOperation({
      scope: reorderedScope,
      operationId: capture.operationId,
      expectedRevision: row.revision,
      remote: remote.adapter,
      signal: new AbortController().signal,
      authorize: async () => undefined,
    })
  ).resolves.toEqual({ status: 'busy' });
  await expect(
    recoverInterruptedSyncQueueOperation(reorderedScope, capture.operationId, row.revision)
  ).resolves.toEqual({ status: 'busy' });
  expect(remote.calls).toEqual(calls);
  held.release();
  await expect(running).resolves.toMatchObject({
    status: 'finished',
    operation: { status: 'published', outcome: 'verified' },
  });
  expect(f.nativeSources()).toEqual(source);
});

it('finishes an independent operation while another operation has an issued write in flight', async () => {
  const f = setup();
  const first = f.capture('first');
  const second = f.capture('second');
  await enqueueSyncQueueOperation(first);
  await enqueueSyncQueueOperation(second);
  const source = f.nativeSources();
  const remote = memoryRemote();
  const held = remote.holdNextWrite();
  const running = execute(first, remote.adapter);
  await held.issued;
  await expect(execute(second, remote.adapter)).resolves.toMatchObject({
    status: 'finished',
    operation: { operationId: 'second', outcome: 'verified' },
  });
  expect(await current('first')).toMatchObject({ status: 'running', stage: 'publishing' });
  expect(remote.writes()).toHaveLength(2);
  held.release();
  await expect(running).resolves.toMatchObject({
    operation: { operationId: 'first', outcome: 'verified' },
  });
  expect(f.nativeSources()).toEqual(source);
});

it.each(['pause', 'cancel'] as const)(
  'fences an issued write callback after operation %s and retains native source and dispatch evidence',
  async (command) => {
    const f = setup();
    const capture = f.capture();
    await enqueueSyncQueueOperation(capture);
    const source = f.nativeSources();
    const remote = memoryRemote();
    const held = remote.holdNextWrite();
    const running = execute(capture, remote.adapter);
    await held.issued;
    const dispatchRows = structuredClone(f.table('sync_outbox'));
    const row = await current();
    const stopped = await commandSyncQueueOperation(
      scope,
      capture.operationId,
      row.revision,
      command
    );
    expect(await loadPreparedOutgoingOperation(scope.spaceId, capture.operationId)).not.toBeNull();
    expect(stopped).toMatchObject({
      status: command === 'pause' ? 'paused' : 'cancelled',
      outcome: 'unknown',
    });
    held.release();
    await expect(running).resolves.toEqual({ status: 'finished', operation: stopped });
    expect(remote.calls.map(({ method }) => method)).toEqual(['write']);
    expect(
      await loadVerifiedOutgoingResult(
        scope.spaceId,
        scope.connectionGeneration,
        capture.operationId
      )
    ).toBeNull();
    for (const [key, value] of dispatchRows) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'kind' in value &&
        value.kind === 'queue-operation'
      )
        continue;
      expect(f.table('sync_outbox').get(key)).toEqual(value);
    }
    expect(f.nativeSources()).toEqual(source);
  }
);

it('does not let an old issued callback change an operation that was paused and resumed', async () => {
  const f = setup();
  const capture = f.capture();
  await enqueueSyncQueueOperation(capture);
  const remote = memoryRemote();
  const held = remote.holdNextWrite();
  const running = execute(capture, remote.adapter);
  await held.issued;
  const row = await current();
  const paused = await commandSyncQueueOperation(scope, capture.operationId, row.revision, 'pause');
  const resumed = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    paused.revision,
    'resume'
  );
  await expect(execute(capture, remote.adapter, resumed.revision)).resolves.toEqual({
    status: 'busy',
  });
  held.release();
  await expect(running).resolves.toEqual({ status: 'finished', operation: resumed });
  expect(await current()).toEqual(resumed);
  expect(remote.calls.map(({ method }) => method)).toEqual(['write']);
  const result = await execute(capture, remote.adapter, resumed.revision);
  expect(result).toMatchObject({ operation: { status: 'published', outcome: 'verified' } });
  expect(new Set(remote.writes()).size).toBe(2);
});

it('connection pause stops the next effect after an issued write without disabling capture enrollment', async () => {
  const f = setup();
  const capture = f.capture();
  await enqueueSyncQueueOperation(capture);
  const source = f.nativeSources();
  const remote = memoryRemote();
  const held = remote.holdNextWrite();
  const running = execute(capture, remote.adapter);
  await held.issued;
  const connection = (await loadSyncQueue(scope)).connection;
  await commandSyncQueue(scope, connection.revision, 'pause');
  held.release();
  await expect(running).resolves.toMatchObject({
    operation: { status: 'failed', outcome: 'unknown' },
  });
  expect(remote.calls.map(({ method }) => method)).toEqual(['write']);
  expect(f.nativeSources()).toEqual(source);
  const acceptedWhilePaused = f.capture('accepted-while-paused');
  await enqueueSyncQueueOperation(acceptedWhilePaused);
  expect(f.table('sync_capture').get(acceptedWhilePaused.key)).toEqual(acceptedWhilePaused);
  await expect(execute(acceptedWhilePaused, remote.adapter)).rejects.toThrow('refused');
});

async function unknownPublication() {
  const f = setup();
  const capture = f.capture();
  await enqueueSyncQueueOperation(capture);
  const source = f.nativeSources();
  const remote = memoryRemote();
  remote.loseNextResponse();
  await expect(execute(capture, remote.adapter)).resolves.toMatchObject({
    operation: { status: 'failed', outcome: 'unknown', failureCode: 'temporary' },
  });
  expect(remote.writes()).toHaveLength(1);
  expect(
    await loadVerifiedOutgoingResult(scope.spaceId, scope.connectionGeneration, capture.operationId)
  ).toBeNull();
  return { f, capture, source, remote };
}

it('keeps a lost manifest response unknown and retries identical logical bytes on a fresh physical path', async () => {
  const { f, capture, source, remote } = await unknownPublication();
  const prepared = await loadPreparedOutgoingOperation(scope.spaceId, capture.operationId);
  const firstKey = remote.writes()[0]!;
  const firstBody = await remote.bodies.get(firstKey)!.text();
  const failed = await current();
  const retry = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    failed.revision,
    'retry'
  );
  await expect(execute(capture, remote.adapter, retry.revision)).resolves.toMatchObject({
    operation: { status: 'published', outcome: 'verified' },
  });
  const nextKey = remote.writes()[1]!;
  expect(nextKey).not.toBe(firstKey);
  expect(await remote.bodies.get(firstKey)!.text()).toBe(firstBody);
  expect(await loadPreparedOutgoingOperation(scope.spaceId, capture.operationId)).toBeNull();
  const nextManifest: unknown = JSON.parse(await remote.bodies.get(nextKey)!.text());
  expect(nextManifest).toMatchObject({ operationText: prepared?.recordText });
  expect(f.nativeSources()).toEqual(source);
});

it('uses a stored verified result after interrupted recovery without network or another authorization', async () => {
  const f = setup();
  const capture = f.capture();
  await enqueueSyncQueueOperation(capture);
  const source = f.nativeSources();
  // Seed termination after dispatch committed its receipt but before queue completion.
  const abandoned = await beginSyncQueueRun(scope, capture.operationId, 1);
  await prepareCapturedOutgoing(capture);
  await advanceSyncQueueRun(abandoned, 'publishing');
  const remote = memoryRemote();
  await dispatchPreparedOutgoing(
    scope.spaceId,
    capture.operationId,
    remote.adapter,
    new AbortController().signal
  );
  const receipt = await loadVerifiedOutgoingResult(
    scope.spaceId,
    scope.connectionGeneration,
    capture.operationId
  );
  expect(receipt).not.toBeNull();
  expect(await current()).toMatchObject({ status: 'running', runId: abandoned.runId });
  await expect(
    recoverInterruptedSyncQueueOperation(scope, capture.operationId, abandoned.revision)
  ).resolves.toMatchObject({ operation: { status: 'interrupted', outcome: 'unknown' } });
  const recovered = await current();
  const retry = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    recovered.revision,
    'retry'
  );
  remote.calls.length = 0;
  const authorize = vi.fn(async () => undefined);
  await expect(
    execute(capture, remote.adapter, retry.revision, { authorize })
  ).resolves.toMatchObject({
    operation: { status: 'published', outcome: 'verified', attemptId: receipt?.attemptId },
  });
  expect(remote.calls).toEqual([]);
  expect(authorize).not.toHaveBeenCalled();
  expect(
    await loadVerifiedOutgoingResult(scope.spaceId, scope.connectionGeneration, capture.operationId)
  ).toEqual(receipt);
  expect(f.nativeSources()).toEqual(source);
});

it('accepts observed lost-response publication without upload or an acknowledged result', async () => {
  const { f, capture, source, remote } = await unknownPublication();
  const catalog = await scanSyncCatalog(
    remote.adapter,
    scope.spaceId,
    new AbortController().signal
  );
  expect(catalog.operations.has(capture.operationId)).toBe(true);
  const failed = await current();
  const retry = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    failed.revision,
    'retry'
  );
  const outbox = structuredClone(f.table('sync_outbox'));
  remote.calls.length = 0;
  await expect(
    execute(capture, remote.adapter, retry.revision, { catalog })
  ).resolves.toMatchObject({
    operation: { status: 'published', outcome: 'observed' },
  });
  expect(remote.calls).toEqual([]);
  expect(
    await loadVerifiedOutgoingResult(scope.spaceId, scope.connectionGeneration, capture.operationId)
  ).toMatchObject({ publicationKind: 'observed' });
  for (const [key, value] of outbox) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      value.kind === 'queue-operation'
    )
      continue;
    expect(f.table('sync_outbox').get(key)).toEqual(value);
  }
  expect(f.nativeSources()).toEqual(source);
});

it.each([
  'pending',
  'quarantined',
  'invalidOperations',
  'invalid-manifest',
  'foreign-space',
  'contradictory',
] as const)('does not treat %s catalog evidence as observed publication', async (kind) => {
  const { f, capture, source, remote } = await unknownPublication();
  let catalog = await scanSyncCatalog(remote.adapter, scope.spaceId, new AbortController().signal);
  const entry = catalog.operations.get(capture.operationId)!;
  expect(entry).toBeDefined();
  if (kind === 'pending' || kind === 'quarantined' || kind === 'invalidOperations') {
    catalog[kind].push(capture.operationId);
  } else if (kind === 'invalid-manifest') {
    remote.bodies.set(remote.writes()[0]!, new Blob(['invalid']));
    catalog = await scanSyncCatalog(remote.adapter, scope.spaceId, new AbortController().signal);
    expect(catalog.invalid).toHaveLength(1);
  } else if (kind === 'foreign-space') {
    entry.operation.spaceId = 'foreign';
  } else {
    const alternative = await createSyncAttempt(
      JSON.stringify({ ...entry.operation, rootId: 'contradictory-root' }),
      crypto.randomUUID()
    );
    remote.bodies.set(alternative.recordKey, new Blob([alternative.recordText]));
    catalog = await scanSyncCatalog(remote.adapter, scope.spaceId, new AbortController().signal);
    expect(catalog.quarantined).toContain(capture.operationId);
    expect(catalog.operations.has(capture.operationId)).toBe(false);
  }
  const failed = await current();
  const retry = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    failed.revision,
    'retry'
  );
  remote.calls.length = 0;
  await expect(
    execute(capture, remote.adapter, retry.revision, { catalog })
  ).resolves.toMatchObject({
    operation: { status: 'published', outcome: 'verified' },
  });
  expect(remote.writes()).toHaveLength(1);
  expect(remote.calls.map(({ method }) => method)).toEqual(['write', 'read']);
  expect(f.nativeSources()).toEqual(source);
});

it('executes and recovers a selected operation with more than 128 unrelated queued operations', async () => {
  const f = setup();
  for (let i = 0; i < 129; i++) await enqueueSyncQueueOperation(f.capture(`other-${i}`));
  const capture = f.capture('selected');
  await enqueueSyncQueueOperation(capture);
  const source = f.nativeSources();
  const abandoned = await beginSyncQueueRun(scope, capture.operationId, 1);
  const recovered = await recoverInterruptedSyncQueueOperation(
    scope,
    capture.operationId,
    abandoned.revision
  );
  expect(recovered).toMatchObject({ status: 'finished', operation: { status: 'interrupted' } });
  if (recovered.status !== 'finished') throw new Error('Expected recovered operation.');
  const retry = await commandSyncQueueOperation(
    scope,
    capture.operationId,
    recovered.operation.revision,
    'retry'
  );
  const remote = memoryRemote();
  expect(await execute(capture, remote.adapter, retry.revision)).toMatchObject({
    status: 'finished',
    operation: { status: 'published', outcome: 'verified' },
  });
  expect(remote.writes()).toHaveLength(1);
  expect(f.nativeSources()).toEqual(source);
});

it.each([
  ['binding-mismatch', 'invalid-workspace'],
  ['invalid-binding', 'invalid-workspace'],
  ['marker-missing', 'invalid-workspace'],
  ['invalid-marker', 'invalid-workspace'],
  ['unsupported-format', 'invalid-workspace'],
  ['workspace-changed', 'invalid-workspace'],
  ['metadata-limit', 'invalid-workspace'],
  ['unavailable', 'temporary'],
  ['cancelled', 'interrupted'],
] as const)(
  'persists marker admission %s after native claim without operation effects',
  async (code, failureCode) => {
    const f = setup();
    const capture = f.capture('operation');
    await enqueueSyncQueueOperation(capture);
    const remote = memoryRemote();
    const source = f.nativeSources();
    const authorize = vi.fn(async () => {
      expect(await current()).toMatchObject({ status: 'running', stage: 'checking' });
      expect(remote.calls).toEqual([]);
      throw new SyncWorkspaceError(code);
    });
    const result = await execute(capture, remote.adapter, 1, { authorize });
    expect(result).toMatchObject({
      status: 'finished',
      operation: { failureCode, writeStarted: false },
    });
    const failed = await current();
    expect(failed.status).toBe('failed');
    if (failureCode === 'temporary') expect(failed.nextDueAt).toEqual(expect.any(Number));
    else expect(failed.nextDueAt).toBeNull();
    expect(authorize).toHaveBeenCalledOnce();
    expect(remote.calls).toEqual([]);
    expect(f.nativeSources()).toEqual(source);
  }
);

it('refuses actual marker mismatch before queue publication effects', async () => {
  const f = setup();
  const capture = f.capture('operation');
  await enqueueSyncQueueOperation(capture);
  const remote = memoryRemote();
  const marker = encodeSyncWorkspaceMarker(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  );
  remote.bodies.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([marker.text]));
  const result = await execute(capture, remote.adapter, 1, {
    authorize: async () => {
      expect(await current()).toMatchObject({ status: 'running', stage: 'checking' });
      await verifySyncWorkspaceIdentity(
        remote.adapter,
        { ...marker.identity, fingerprint: 'a'.repeat(64) },
        new AbortController().signal
      );
    },
  });
  expect(result).toMatchObject({
    operation: {
      status: 'failed',
      failureCode: 'invalid-workspace',
      writeStarted: false,
      nextDueAt: null,
    },
  });
  expect(remote.calls.map(({ key }) => key)).toEqual([
    SYNC_WORKSPACE_MARKER_KEY,
    SYNC_WORKSPACE_MARKER_KEY,
  ]);
  expect(remote.writes()).toEqual([]);
});
