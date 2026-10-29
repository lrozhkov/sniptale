import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { captureRootKey, type PreparedCaptureOperation } from './contracts';
import {
  assertConflictResolutionCurrent,
  commitConflictResolution,
  loadConflictResolutionContext,
} from './conflict-resolution';
import { hashCaptureText, parseSyncCaptureRecord } from './guards';
import { loadPreparedOutgoingOperation, preparedOutgoingOperationKey } from './outgoing';
import { parseSyncQueueOperation, queueOperationKey } from './queue-model';
import {
  authorization,
  scope,
  deferred,
  createReconciliationFixture,
} from './queue-reconciliation.test-support';

const io = vi.hoisted(() => ({ prepared: vi.fn(), initialize: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
  initDB: io.initialize,
}));
const rootId = 'recording:decision-root';
const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
const stateKey = JSON.stringify(['root-state', rootKey]);
const commandId = '10000000-0000-4000-8000-000000000001';
function selection(operationId = commandId) {
  return { scope, authorization, rootKind: 'media' as const, rootId, operationId };
}
function setup() {
  const f = createReconciliationFixture();
  io.prepared.mockReturnValue(f.database);
  io.initialize.mockResolvedValue(f.database);
  const state = {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt: 1,
    spaceId: scope.spaceId,
    rootKind: 'media',
    rootId,
    rootKey,
    generation: 4,
    basis: ['ancestor'],
  };
  f.table('sync_capture').set(stateKey, state);
  return { ...f, state };
}
async function decision(operationId = commandId): Promise<PreparedCaptureOperation> {
  const logical = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: scope.spaceId,
    operationId,
    rootKind: 'media',
    rootId,
    kind: 'delete',
    parents: ['left', 'right'],
    dependencies: [],
    envelope: null,
    objects: [],
  };
  const recordText = JSON.stringify(logical);
  return {
    version: 1,
    kind: 'sync-operation',
    phase: 'prepared',
    key: JSON.stringify(['resolution', scope.spaceId, operationId]),
    createdAt: 1,
    ...scope,
    rootKind: 'media',
    rootId,
    rootKey,
    generation: 5,
    operationId,
    basis: ['left', 'right'],
    origin: 'local-restore',
    publicationId: null,
    sourceSha256: hashCaptureText(recordText),
    source: { changeKind: 'tombstone', label: rootId },
    prepared: {
      recordText,
      recordSha256: hashCaptureText(recordText),
      objects: [],
      retainedObjects: [],
    },
  };
}
function input(operation: PreparedCaptureOperation) {
  return {
    ...selection(operation.operationId),
    expectedGeneration: 4,
    expectedBasis: ['ancestor'],
    operation,
  };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('atomically admits one prepared decision and its existing queue without advancing native root state', async () => {
  const f = setup();
  const operation = await decision();
  const beforeMedia = structuredClone(f.table('media_library'));
  const observe = vi.spyOn(f.database, 'transaction');
  expect(await commitConflictResolution(input(operation))).toEqual(operation);
  expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
  expect(f.table('media_library')).toEqual(beforeMedia);
  expect(f.table('asset_refs').size).toBe(0);
  expect(f.table('asset_owners').size).toBe(0);
  const queue = parseSyncQueueOperation(
    f.table('sync_outbox').get(queueOperationKey(scope, commandId))
  );
  expect(queue).toMatchObject({
    operationId: commandId,
    captureKey: operation.key,
    status: 'queued',
    generation: 5,
  });
  const prepared = await loadPreparedOutgoingOperation(scope.spaceId, commandId);
  expect(prepared).toMatchObject({
    recordText: operation.prepared.recordText,
    objects: [],
    retainedObjects: [],
  });
  expect(
    observe.mock.calls.every(([stores]) =>
      stores.every((name) => ['sync_capture', 'sync_connection', 'sync_outbox'].includes(name))
    )
  ).toBe(true);
});

it('replays the same command after native ordering changes and after source payload compaction', async () => {
  const f = setup();
  const operation = await decision();
  await commitConflictResolution(input(operation));
  const { prepared, phase: ignored, ...header } = operation;
  void ignored;
  const compact = {
    ...header,
    phase: 'published',
    objects: [],
    publication: {
      kind: 'verified',
      acceptedAt: 2,
      preparedSha256: prepared.recordSha256,
      attemptId: '20000000-0000-4000-8000-000000000001',
      recordKey: '.sniptale/operations/retained.json',
      recordSha256: 'a'.repeat(64),
    },
  };
  expect(parseSyncCaptureRecord(compact)).not.toBeNull();
  f.table('sync_capture').set(operation.key, compact);
  f.table('sync_capture').set(stateKey, { ...f.state, generation: 8, basis: ['new-local'] });
  const before = structuredClone(f.rows);
  expect(await commitConflictResolution(input(operation))).toEqual(compact);
  expect(await loadConflictResolutionContext(selection())).toMatchObject({
    generation: 8,
    existing: compact,
  });
  expect(f.rows).toEqual(before);
});

it.each(['generation', 'basis', 'revoked'] as const)(
  'refuses a stale %s decision without a partial prepared locator or queue row',
  async (kind) => {
    const f = setup();
    const operation = await decision();
    if (kind === 'generation') f.table('sync_capture').set(stateKey, { ...f.state, generation: 5 });
    if (kind === 'basis')
      f.table('sync_capture').set(stateKey, { ...f.state, basis: ['new-head'] });
    if (kind === 'revoked')
      f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
    const before = structuredClone(f.rows);
    await expect(commitConflictResolution(input(operation))).rejects.toThrow();
    expect(f.rows).toEqual(before);
    expect(f.table('sync_outbox').has(preparedOutgoingOperationKey(scope.spaceId, commandId))).toBe(
      false
    );
  }
);

it('rechecks a new local generation when a prepared decision waits for mutation admission', async () => {
  const f = setup();
  const operation = await decision();
  const reached = deferred();
  const release = deferred();
  const blocker = runWithExclusivePersistenceMutationPermit(async () => {
    reached.resolve();
    await release.promise;
  });
  await reached.promise;
  const pending = commitConflictResolution(input(operation));
  const refused = expect(pending).rejects.toThrow('native selection changed');
  f.table('sync_capture').set(stateKey, { ...f.state, generation: 5, basis: ['new-local'] });
  const before = structuredClone(f.rows);
  release.resolve();
  await blocker;
  await refused;
  expect(f.rows).toEqual(before);
});

it('retains two competing decisions made from the same observed native generation', async () => {
  const f = setup();
  const secondId = '10000000-0000-4000-8000-000000000002';
  const [firstContext, secondContext] = await Promise.all([
    loadConflictResolutionContext(selection()),
    loadConflictResolutionContext(selection(secondId)),
  ]);
  expect(firstContext).toEqual(secondContext);
  const first = await decision();
  const second = await decision(secondId);
  // Both decisions were observed before either commit. IndexedDB orders their write transactions.
  await commitConflictResolution({
    ...input(first),
    expectedGeneration: firstContext.generation,
    expectedBasis: firstContext.basis,
  });
  await commitConflictResolution({
    ...input(second),
    expectedGeneration: secondContext.generation,
    expectedBasis: secondContext.basis,
  });
  expect(f.table('sync_capture').get(first.key)).toEqual(first);
  expect(f.table('sync_capture').get(second.key)).toEqual(second);
  expect(f.table('sync_outbox').has(queueOperationKey(scope, secondId))).toBe(true);
  expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
});

it('rolls back a refused queue write and retries the same immutable command once', async () => {
  const f = setup();
  const operation = await decision();
  const before = structuredClone(f.rows);
  f.failAfterOneWrite();
  await expect(commitConflictResolution(input(operation))).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(f.rows).toEqual(before);
  expect(await commitConflictResolution(input(operation))).toEqual(operation);
  const accepted = structuredClone(f.rows);
  expect(await commitConflictResolution(input(operation))).toEqual(operation);
  expect(f.rows).toEqual(accepted);
});

it('refuses reuse of one command identity for different logical bytes', async () => {
  const f = setup();
  const operation = await decision();
  await commitConflictResolution(input(operation));
  const changed = structuredClone(operation);
  const recordText = changed.prepared.recordText.replace('"left","right"', '"other","right"');
  changed.prepared.recordText = recordText;
  changed.prepared.recordSha256 = hashCaptureText(recordText);
  changed.sourceSha256 = hashCaptureText(recordText);
  const before = structuredClone(f.rows);
  await expect(commitConflictResolution(input(changed))).rejects.toThrow('identity reused');
  expect(f.rows).toEqual(before);
});

it('refuses outgoing dispatch admission after a newer local generation without creating native state', async () => {
  const f = setup();
  const operation = await decision();
  await commitConflictResolution(input(operation));
  const prepared = await loadPreparedOutgoingOperation(scope.spaceId, commandId);
  if (!prepared) throw new Error('Missing prepared decision');
  await expect(assertConflictResolutionCurrent(prepared)).resolves.toBeUndefined();
  f.table('sync_capture').set(stateKey, { ...f.state, generation: 5, basis: ['new-local'] });
  const before = structuredClone(f.rows);
  await expect(assertConflictResolutionCurrent(prepared)).rejects.toMatchObject({
    code: 'selection-changed',
  });
  expect(f.rows).toEqual(before);
});
