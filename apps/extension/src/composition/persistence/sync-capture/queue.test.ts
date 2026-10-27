import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  enqueueSyncQueueOperation,
  loadSyncQueue,
  commandSyncQueue,
  commandSyncQueueOperation,
  beginSyncQueueRun,
  advanceSyncQueueRun,
  failSyncQueueRun,
  recoverSyncQueueRun,
  completeSyncQueueRun,
} from './queue';
import {
  queueConnectionKey,
  queueOperationKey,
  queueHash,
  type SyncQueueScope,
} from './queue-model';
import { commitPreparedOutgoingOperation, preparedOutgoingOperationKey } from './outgoing';
import { commitOutgoingDispatchAttempt } from './outgoing-attempts';
import { commitVerifiedOutgoingResult, verifiedOutgoingResultKey } from './outgoing-results';
const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) });
});
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_outbox');
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  table('sync_capture').set('profile', profile);
  const capture: CapturedChange = {
    version: 1,
    kind: 'captured-change',
    key: '["change","op"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    rootKind: 'media',
    rootId: 'root',
    rootKey: captureRootKey('space', 'media', 'root'),
    generation: 1,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'tombstone' },
  };
  table('sync_capture').set(capture.key, structuredClone(capture));
  return {
    ...fixture,
    table,
    profile,
    capture,
    failWrites(value: boolean) {
      fail = value;
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
it('loads a virtual connection without writes and detaches enqueue input', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  expect(await loadSyncQueue(scope)).toMatchObject({
    connection: { revision: 0, paused: false },
    operations: [],
  });
  expect(f.rows).toEqual(before);
  const pending = enqueueSyncQueueOperation(f.capture);
  f.capture.generation = 9;
  const row = await pending;
  expect(row.generation).toBe(1);
  expect((await loadSyncQueue(scope)).operations).toEqual([row]);
});
it('rejects a delayed parallel command after the first accepted command', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const gate = deferred<typeof f.database>();
  io.database.mockImplementationOnce(() => gate.promise);
  const delayed = commandSyncQueueOperation(scope, 'op', 1, 'cancel');
  await commandSyncQueueOperation(scope, 'op', 1, 'pause');
  gate.resolve(f.database);
  await expect(delayed).rejects.toThrow('Stale');
  expect((await loadSyncQueue(scope)).operations[0]).toMatchObject({
    status: 'paused',
    revision: 2,
  });
});
it('accepts only one parallel run claim and issues a fresh run identity after recovery', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const gate = deferred<typeof f.database>();
  io.database.mockImplementationOnce(() => gate.promise);
  const delayed = beginSyncQueueRun(scope, 'op', 1);
  const first = await beginSyncQueueRun(scope, 'op', 1);
  gate.resolve(f.database);
  await expect(delayed).rejects.toThrow('refused');
  const interrupted = await recoverSyncQueueRun(first);
  const retry = await commandSyncQueueOperation(scope, 'op', interrupted.revision, 'retry');
  const next = await beginSyncQueueRun(scope, 'op', retry.revision);
  expect(next.runId).not.toBe(first.runId);
  await expect(failSyncQueueRun(first)).rejects.toThrow('Stale');
});
it('global pause blocks claims and effects without changing capture enrollment or active completion', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  await commandSyncQueue(scope, 1, 'pause');
  await expect(advanceSyncQueueRun(run, 'writing')).rejects.toThrow('refused');
  const failed = await failSyncQueueRun(run);
  expect(failed.outcome).toBe('none');
  const retry = await commandSyncQueueOperation(scope, 'op', failed.revision, 'retry');
  await expect(beginSyncQueueRun(scope, 'op', retry.revision)).rejects.toThrow('refused');
  expect(f.table('sync_capture').get('profile')).toEqual(f.profile);
  await commandSyncQueue(scope, 2, 'resume');
  await expect(beginSyncQueueRun(scope, 'op', retry.revision)).resolves.toMatchObject({
    operationId: 'op',
  });
});
it.each(['pause', 'cancel'] as const)(
  'fences delayed callbacks after %s and retains every source record',
  async (command) => {
    const f = setup();
    await enqueueSyncQueueOperation(f.capture);
    const run = await beginSyncQueueRun(scope, 'op', 1);
    await advanceSyncQueueRun(run, 'writing', '11111111-1111-4111-8111-111111111111');
    const sources = structuredClone(f.table('sync_capture'));
    const row = await commandSyncQueueOperation(scope, 'op', run.revision, command);
    expect(row.outcome).toBe('unknown');
    await expect(failSyncQueueRun(run)).rejects.toThrow('Stale');
    await expect(advanceSyncQueueRun(run, 'verifying')).rejects.toThrow('Stale');
    expect(f.table('sync_capture')).toEqual(sources);
  }
);
it('ordinary stage progress does not invalidate same-run user commands', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  const checking = await advanceSyncQueueRun(run, 'checking');
  expect(checking.revision).toBe(run.revision);
  expect(checking.eventSequence).toBe(3);
  await expect(
    commandSyncQueueOperation(scope, 'op', run.revision, 'pause')
  ).resolves.toMatchObject({ status: 'paused' });
});
it.each(['removed', 'rotated', 'recreated'] as const)(
  'refuses delayed writes after profile %s',
  async (change) => {
    const f = setup();
    await enqueueSyncQueueOperation(f.capture);
    const run = await beginSyncQueueRun(scope, 'op', 1);
    if (change === 'removed') f.table('sync_capture').delete('profile');
    else
      f.table('sync_capture').set('profile', {
        ...f.profile,
        ...(change === 'rotated' ? { connectionGeneration: 4 } : { createdAt: 2 }),
      });
    const before = structuredClone(f.rows);
    await expect(advanceSyncQueueRun(run, 'writing')).rejects.toThrow('profile changed');
    expect(f.rows).toEqual(before);
  }
);
it('refuses replaced capture identity after root deletion and recreation', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  f.table('sync_capture').delete(f.capture.key);
  await expect(failSyncQueueRun(run)).rejects.toThrow('capture changed');
  f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 2, generation: 2 });
  await expect(failSyncQueueRun(run)).rejects.toThrow('capture changed');
});
it('rolls back failed native writes and accepts an explicit retry with the same command revision', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commandSyncQueueOperation(scope, 'op', 1, 'pause')).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  await expect(commandSyncQueueOperation(scope, 'op', 1, 'pause')).resolves.toMatchObject({
    revision: 2,
  });
});
it('retains only safe bounded markers with an explicit history gap', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  for (let index = 0; index < 71; index++)
    await commandSyncQueueOperation(scope, 'op', index + 1, index % 2 === 0 ? 'pause' : 'resume');
  const row = (await loadSyncQueue(scope)).operations[0]!;
  expect(row.pendingTransitions).toHaveLength(64);
  expect(row.droppedTransitions).toBe(8);
  expect(row.pendingTransitions[0]!.sequence).toBe(9);
  for (const marker of row.pendingTransitions) {
    expect(Object.keys(marker).sort()).toEqual([
      'attemptId',
      'code',
      'operationRef',
      'sequence',
      'stage',
    ]);
    expect(marker.operationRef).toMatch(/^[0-9a-f]{64}$/u);
  }
  expect(JSON.stringify(row.pendingTransitions)).not.toContain('root');
});
it.each(['connection', 'operation'] as const)(
  'refuses malformed authoritative %s without repair',
  async (kind) => {
    const f = setup();
    await enqueueSyncQueueOperation(f.capture);
    const key = kind === 'connection' ? queueConnectionKey(scope) : queueOperationKey(scope, 'op');
    f.table('sync_outbox').set(key, { key, kind: `queue-${kind}`, version: 999 });
    const before = structuredClone(f.rows);
    await expect(loadSyncQueue(scope)).rejects.toThrow('Invalid');
    expect(f.rows).toEqual(before);
  }
);
it('failed opening enqueue retains source and retries without a partial control row', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(enqueueSyncQueueOperation(f.capture)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  const row = await enqueueSyncQueueOperation(f.capture);
  expect(row.revision).toBe(1);
  expect(await enqueueSyncQueueOperation(f.capture)).toEqual(row);
  expect((await loadSyncQueue(scope)).connection.revision).toBe(1);
});
it('retains preparations attempts and claims through cancel and leaves independent operations eligible', async () => {
  const f = setup();
  const sourceEvidence = [
    { key: '["prepared","op"]', kind: 'test-prepared', text: 'immutable' },
    { key: '["attempt","op"]', kind: 'test-attempt', text: 'physical' },
  ];
  for (const row of sourceEvidence) f.table('sync_outbox').set(row.key, row);
  f.table('asset_owners').set('claim', { ownerKind: 'capture', ownerId: 'op', role: 'source' });
  await enqueueSyncQueueOperation(f.capture);
  const sibling = {
    ...f.capture,
    operationId: 'sibling',
    key: '["change","sibling"]',
    rootId: 'other',
    rootKey: captureRootKey('space', 'media', 'other'),
    generation: 1,
    basis: [],
  };
  f.table('sync_capture').set(sibling.key, sibling);
  await enqueueSyncQueueOperation(sibling);
  await commandSyncQueueOperation(scope, 'op', 1, 'cancel');
  for (const row of sourceEvidence) expect(f.table('sync_outbox').get(row.key)).toEqual(row);
  expect(f.table('asset_owners').get('claim')).toEqual({
    ownerKind: 'capture',
    ownerId: 'op',
    role: 'source',
  });
  await expect(beginSyncQueueRun(scope, 'sibling', 1)).resolves.toMatchObject({
    operationId: 'sibling',
  });
  await expect(commandSyncQueueOperation(scope, 'op', 2, 'retry')).rejects.toThrow('refused');
});
async function publication(f: ReturnType<typeof setup>) {
  const logical = '{"record":1}';
  const prepared = await commitPreparedOutgoingOperation(f.capture, {
    version: 1,
    key: preparedOutgoingOperationKey('space', 'op'),
    createdAt: 2,
    spaceId: 'space',
    connectionGeneration: 3,
    captureKey: f.capture.key,
    rootKey: f.capture.rootKey,
    generation: f.capture.generation,
    operationId: 'op',
    recordText: logical,
    recordSha256: queueHash(logical),
    attemptKey: 'records/initial.json',
    objects: [],
  });
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const recordText = JSON.stringify({
    format: 'sniptale-sync-attempt',
    version: 1,
    attemptId,
    operationText: logical,
    operationSha256: queueHash(logical),
    objects: [],
  });
  const { attempt } = await commitOutgoingDispatchAttempt(prepared, {
    version: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    operationId: 'op',
    attemptId,
    preparedSha256: prepared.recordSha256,
    recordText,
    recordSha256: queueHash(recordText),
    recordKey: 'records/physical.json',
    objects: [],
  });
  return { prepared, attempt };
}
it('completes from exact native verified joins and refuses retry of published work', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  const { prepared, attempt } = await publication(f);
  const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
  const sources = structuredClone(f.rows);
  const row = await completeSyncQueueRun(run, { kind: 'verified', result });
  expect(row).toMatchObject({
    status: 'published',
    outcome: 'verified',
    revision: run.revision + 1,
  });
  expect(f.table('sync_capture')).toEqual(sources.get('sync_capture'));
  expect(f.table('sync_outbox').get(result.key)).toEqual(result);
  await expect(commandSyncQueueOperation(scope, 'op', row.revision, 'retry')).rejects.toThrow(
    'refused'
  );
  await expect(completeSyncQueueRun(run, { kind: 'verified', result })).rejects.toThrow('Stale');
});
it('accepts observed publication without a receipt or retained foreign attempt', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  const { prepared, attempt } = await publication(f);
  f.table('sync_outbox').delete(attempt.key);
  const row = await completeSyncQueueRun(run, { kind: 'observed', prepared, attempt });
  expect(row.outcome).toBe('observed');
  expect(f.table('sync_outbox').has(attempt.key)).toBe(false);
  expect(f.table('sync_outbox').has(verifiedOutgoingResultKey('space', 3, 'op'))).toBe(false);
});
it.each(['missing-receipt', 'changed-attempt', 'changed-logical-bytes'] as const)(
  'refuses completion with %s',
  async (change) => {
    const f = setup();
    await enqueueSyncQueueOperation(f.capture);
    const run = await beginSyncQueueRun(scope, 'op', 1);
    const { prepared, attempt } = await publication(f);
    const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
    if (change === 'missing-receipt') f.table('sync_outbox').delete(result.key);
    if (change === 'changed-attempt')
      f.table('sync_outbox').set(attempt.key, { ...attempt, recordSha256: 'a'.repeat(64) });
    const before = structuredClone(f.rows);
    if (change === 'changed-logical-bytes') {
      const recordText = JSON.stringify({ operationText: 'different' });
      const other = { ...attempt, recordText, recordSha256: queueHash(recordText) };
      await expect(
        completeSyncQueueRun(run, { kind: 'observed', prepared, attempt: other })
      ).rejects.toThrow();
    } else await expect(completeSyncQueueRun(run, { kind: 'verified', result })).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);
it.each(['pause', 'cancel'] as const)(
  'refuses delayed publication callbacks after operation %s',
  async (command) => {
    const f = setup();
    await enqueueSyncQueueOperation(f.capture);
    const run = await beginSyncQueueRun(scope, 'op', 1);
    const { prepared, attempt } = await publication(f);
    const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
    await commandSyncQueueOperation(scope, 'op', run.revision, command);
    await expect(completeSyncQueueRun(run, { kind: 'verified', result })).rejects.toThrow('Stale');
    await expect(
      completeSyncQueueRun(run, { kind: 'observed', prepared, attempt })
    ).rejects.toThrow('Stale');
  }
);
it('global pause permits completion of previously admitted publication', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  const { prepared, attempt } = await publication(f);
  const { result } = await commitVerifiedOutgoingResult(prepared, attempt);
  await commandSyncQueue(scope, 1, 'pause');
  await expect(completeSyncQueueRun(run, { kind: 'verified', result })).resolves.toMatchObject({
    outcome: 'verified',
  });
});
it('persists only fixed failure codes and marks explicit recovery interrupted', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const first = await beginSyncQueueRun(scope, 'op', 1);
  const failed = await failSyncQueueRun(first, 'authentication');
  expect(failed.failureCode).toBe('authentication');
  const retry = await commandSyncQueueOperation(scope, 'op', failed.revision, 'retry');
  const next = await beginSyncQueueRun(scope, 'op', retry.revision);
  expect((await recoverSyncQueueRun(next)).failureCode).toBe('interrupted');
});

it('rechecks repeated effect admissions without redundant stage markers', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  const first = await advanceSyncQueueRun(run, 'writing');
  expect(await advanceSyncQueueRun(run, 'writing')).toEqual(first);
  await commandSyncQueue(scope, 1, 'pause');
  await expect(advanceSyncQueueRun(run, 'writing')).rejects.toThrow('refused');
});

it('admits manifest readback after publishing and refuses backwards publication admission', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const run = await beginSyncQueueRun(scope, 'op', 1);
  await advanceSyncQueueRun(run, 'writing');
  const publishing = await advanceSyncQueueRun(run, 'publishing');
  expect(publishing.writeStarted).toBe(true);
  const verifying = await advanceSyncQueueRun(run, 'verifying');
  expect(verifying.stage).toBe('verifying');
  expect(verifying.revision).toBe(run.revision);
  await expect(advanceSyncQueueRun(run, 'publishing')).rejects.toThrow('refused');
  expect((await loadSyncQueue(scope)).operations[0]).toEqual(verifying);
});
