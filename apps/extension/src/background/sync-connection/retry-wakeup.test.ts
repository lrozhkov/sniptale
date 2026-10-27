import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type {
  SyncQueueOperation,
  SyncQueueScheduleProgress,
} from '../../composition/persistence/sync-capture/queue-model';
import type { SyncQueueDueCandidate } from '../../composition/persistence/sync-capture/queue-schedule';
import type { SyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncQueueRetryWakeup, type SyncQueueRetryWakeupDependencies } from './retry-wakeup';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn }),
}));
const scope = {
  spaceId: '33333333-3333-4333-8333-333333333333',
  connectionGeneration: 3,
  profileCreatedAt: 1,
};
const authorization = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 2 };
const alarmName = 'sniptale:sync-queue-retry';
function connection(): SyncConnectionMetadata {
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
    },
    identity: authorization,
    workspace: {
      spaceId: scope.spaceId,
      bootstrapId: '44444444-4444-4444-8444-444444444444',
      fingerprint: 'a'.repeat(64),
    },
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
}
function progress(overrides: Partial<SyncQueueScheduleProgress> = {}): SyncQueueScheduleProgress {
  return {
    authorization,
    revision: 3,
    afterKey: null,
    complete: true,
    dueAfter: null,
    ...overrides,
  };
}
function candidate(overrides: Partial<SyncQueueDueCandidate> = {}): SyncQueueDueCandidate {
  return {
    scope,
    authorization,
    operationId: 'operation',
    revision: 4,
    nextDueAt: 30_000,
    runId: null,
    runAuthorization: null,
    status: 'failed',
    ...overrides,
  };
}
function snapshot(overrides: Partial<SyncExecutorSnapshot> = {}): SyncExecutorSnapshot {
  return {
    offscreenStartupId: 'document',
    executorId: 'executor',
    executorRevision: 2,
    phase: 'idle',
    binding: { scope, authorization },
    jobs: [],
    workspace: null,
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function dependencies() {
  return {
    loadConnection: vi
      .fn<SyncQueueRetryWakeupDependencies['loadConnection']>()
      .mockResolvedValue(connection()),
    reconcileCaptures: vi
      .fn<SyncQueueRetryWakeupDependencies['reconcileCaptures']>()
      .mockResolvedValue({ enqueued: 0, existing: 0, refused: 0 }),
    loadProgress: vi
      .fn<SyncQueueRetryWakeupDependencies['loadProgress']>()
      .mockResolvedValue(progress()),
    initializePage: vi
      .fn<SyncQueueRetryWakeupDependencies['initializePage']>()
      .mockResolvedValue(progress()),
    discoverDue: vi
      .fn<SyncQueueRetryWakeupDependencies['discoverDue']>()
      .mockResolvedValue({ candidates: [], progress: progress() }),
    deferDue: vi.fn<SyncQueueRetryWakeupDependencies['deferDue']>().mockResolvedValue(true),
    recoverInterrupted: vi
      .fn<SyncQueueRetryWakeupDependencies['recoverInterrupted']>()
      .mockResolvedValue({ status: 'busy' }),
    coordinator: {
      inspect: vi
        .fn<SyncQueueRetryWakeupDependencies['coordinator']['inspect']>()
        .mockResolvedValue(null),
      start: vi
        .fn<SyncQueueRetryWakeupDependencies['coordinator']['start']>()
        .mockResolvedValue({ executorId: 'executor', executorRevision: 3 }),
    },
    getAlarm: vi
      .fn<SyncQueueRetryWakeupDependencies['getAlarm']>()
      .mockResolvedValue({ periodInMinutes: 1 }),
    createAlarm: vi
      .fn<SyncQueueRetryWakeupDependencies['createAlarm']>()
      .mockResolvedValue(undefined),
    subscribeStartup: vi.fn<(listener: () => void) => () => void>().mockReturnValue(vi.fn()),
    subscribeAlarm: vi
      .fn<SyncQueueRetryWakeupDependencies['subscribeAlarm']>()
      .mockReturnValue(vi.fn()),
  };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it('recreates the distinct periodic alarm on restart and dispatches exact native due identities', async () => {
  const deps = dependencies();
  deps.getAlarm.mockResolvedValue(undefined);
  const due = candidate();
  deps.discoverDue.mockResolvedValue({ candidates: [due], progress: progress() });
  const owner = createSyncQueueRetryWakeup(deps);
  expect(deps.loadConnection).not.toHaveBeenCalled();
  await owner.run();
  expect(deps.getAlarm).toHaveBeenCalledWith(alarmName);
  expect(deps.createAlarm).toHaveBeenCalledWith(alarmName, { periodInMinutes: 1 });
  expect(deps.loadProgress).toHaveBeenCalledWith(scope, authorization);
  expect(deps.discoverDue).toHaveBeenCalledWith(scope, authorization, 16);
  expect(deps.coordinator.start).toHaveBeenCalledExactlyOnceWith({
    scope,
    authorization,
    operationId: due.operationId,
    expectedRevision: due.revision,
  });
  expect(deps.initializePage).not.toHaveBeenCalled();
});

it.each([null, 'paused', 'updating-auth'] as const)(
  'requires native active connection on every pass: %s',
  async (phase) => {
    const deps = dependencies();
    deps.loadConnection.mockResolvedValue(phase === null ? null : { ...connection(), phase });
    const owner = createSyncQueueRetryWakeup(deps);
    await owner.run();
    expect(deps.loadProgress).not.toHaveBeenCalled();
    expect(deps.discoverDue).not.toHaveBeenCalled();
    expect(deps.coordinator.start).not.toHaveBeenCalled();
    deps.loadConnection.mockResolvedValue(connection());
    await owner.run();
    expect(deps.loadConnection).toHaveBeenCalledTimes(2);
    expect(deps.discoverDue).toHaveBeenCalledOnce();
  }
);

it('bounds legacy initialization to two pages of 64 with exact progress revision', async () => {
  const deps = dependencies();
  deps.loadProgress.mockResolvedValue(null);
  deps.initializePage
    .mockResolvedValueOnce(progress({ complete: false, afterKey: 'first', revision: 1 }))
    .mockResolvedValueOnce(progress({ complete: false, afterKey: 'second', revision: 2 }));
  const owner = createSyncQueueRetryWakeup(deps);
  await owner.run();
  expect(deps.initializePage.mock.calls).toEqual([
    [scope, authorization, null, 64],
    [scope, authorization, 1, 64],
  ]);
});

it('bounds discovery to two durable pages and starts at most two operations', async () => {
  const deps = dependencies();
  deps.discoverDue
    .mockResolvedValueOnce({
      candidates: [],
      progress: progress({ dueAfter: { dueAt: 30_000, key: 'malformed-prefix' } }),
    })
    .mockResolvedValueOnce({
      candidates: Array.from({ length: 16 }, (_, index) =>
        candidate({ operationId: `operation-${index}` })
      ),
      progress: progress({ dueAfter: { dueAt: 30_000, key: 'next-page' } }),
    });
  const owner = createSyncQueueRetryWakeup(deps);
  await owner.run();
  expect(deps.discoverDue).toHaveBeenCalledTimes(2);
  expect(deps.coordinator.start).toHaveBeenCalledTimes(2);
  expect(deps.coordinator.start.mock.calls.map(([input]) => input.operationId)).toEqual([
    'operation-0',
    'operation-1',
  ]);
});

it('coalesces startup and matching alarm passes while ignoring the local history alarm', async () => {
  const deps = dependencies();
  const loaded = deferred<SyncConnectionMetadata | null>();
  deps.loadConnection.mockReturnValueOnce(loaded.promise);
  const owner = createSyncQueueRetryWakeup(deps);
  const first = owner.run();
  expect(owner.run()).toBe(first);
  const listener = deps.subscribeAlarm.mock.calls[0]?.[0];
  expect(listener).toBeDefined();
  listener?.({ name: 'sniptale:sync-queue-history' });
  listener?.({ name: alarmName });
  loaded.resolve(connection());
  await first;
  expect(deps.loadConnection).toHaveBeenCalledOnce();
  listener?.({ name: 'sniptale:sync-queue-history' });
  expect(deps.getAlarm).toHaveBeenCalledOnce();
  await owner.run();
  expect(deps.loadConnection).toHaveBeenCalledTimes(2);
});

it.each(['failed', 'stopping', 'workspace', 'job'] as const)(
  'defers unsafe executor state %s through native CAS',
  async (state) => {
    const deps = dependencies();
    const due = candidate({ status: 'running', runId: 'run', runAuthorization: authorization });
    const current = snapshot();
    if (state === 'failed' || state === 'stopping') current.phase = state;
    if (state === 'workspace')
      current.workspace = {
        sourceKind: 'allocation',
        selectionIncarnation: 'workspace',
        selectionRevision: 1,
        state: 'running',
        failureCode: null,
      };
    if (state === 'job')
      current.jobs = [
        {
          operationId: due.operationId,
          expectedRevision: due.revision,
          runId: due.runId,
          state: 'running',
          stage: 'writing',
          failureCode: null,
        },
      ];
    deps.coordinator.inspect.mockResolvedValue(current);
    deps.discoverDue.mockResolvedValue({ candidates: [due], progress: progress() });
    await createSyncQueueRetryWakeup(deps).run();
    expect(deps.deferDue).toHaveBeenCalledExactlyOnceWith(due);
    expect(deps.recoverInterrupted).not.toHaveBeenCalled();
    expect(deps.coordinator.start).not.toHaveBeenCalled();
  }
);

it('recovers only an unowned running row and leaves its new deadline for a later pass', async () => {
  const deps = dependencies();
  const due = candidate({ status: 'running', runId: 'run', runAuthorization: authorization });
  const recovered: SyncQueueOperation = {
    ...scope,
    version: 1,
    kind: 'queue-operation',
    key: 'native-operation-key',
    operationId: due.operationId,
    captureKey: 'capture',
    captureSha256: 'digest',
    rootKey: 'root',
    generation: 1,
    revision: due.revision + 1,
    status: 'interrupted',
    stage: 'writing',
    runId: null,
    authorization,
    writeStarted: true,
    outcome: 'unknown',
    attemptId: 'attempt',
    failureCode: 'interrupted',
    eventSequence: 1,
    pendingTransitions: [],
    droppedTransitions: 0,
    nextDueAt: 60_000,
    automaticRetryCount: 1,
  };
  deps.recoverInterrupted.mockResolvedValue({ status: 'finished', operation: recovered });
  deps.discoverDue.mockResolvedValue({ candidates: [due], progress: progress() });
  await createSyncQueueRetryWakeup(deps).run();
  expect(deps.recoverInterrupted).toHaveBeenCalledExactlyOnceWith(
    scope,
    due.operationId,
    due.revision
  );
  expect(deps.deferDue).not.toHaveBeenCalled();
  expect(deps.coordinator.start).not.toHaveBeenCalled();
});

it('continues past a busy recovery to a later eligible operation', async () => {
  const deps = dependencies();
  const busy = candidate({ status: 'running', runId: 'run', runAuthorization: authorization });
  const later = candidate({ operationId: 'later' });
  deps.discoverDue.mockResolvedValue({ candidates: [busy, later], progress: progress() });
  await createSyncQueueRetryWakeup(deps).run();
  expect(deps.deferDue).toHaveBeenCalledWith(busy);
  expect(deps.coordinator.start).toHaveBeenCalledExactlyOnceWith({
    scope,
    authorization,
    operationId: 'later',
    expectedRevision: later.revision,
  });
});

it('preserves the due deadline while an acknowledged matching job awaits its native queued claim', async () => {
  const deps = dependencies();
  const due = candidate({ status: 'queued', revision: 1 });
  const original = structuredClone(due);
  deps.discoverDue.mockResolvedValue({ candidates: [due], progress: progress() });
  deps.coordinator.inspect.mockResolvedValue(
    snapshot({
      phase: 'running',
      jobs: [
        {
          operationId: due.operationId,
          expectedRevision: due.revision,
          runId: null,
          state: 'running',
          stage: 'preparing',
          failureCode: null,
        },
      ],
    })
  );
  await createSyncQueueRetryWakeup(deps).run();
  expect(deps.deferDue).not.toHaveBeenCalled();
  expect(deps.coordinator.start).not.toHaveBeenCalled();
  expect(deps.recoverInterrupted).not.toHaveBeenCalled();
  expect(due).toEqual(original);
});

it('uses the second existing executor slot and refreshes observation before later dispatch', async () => {
  const deps = dependencies();
  const active = {
    operationId: 'unrelated',
    expectedRevision: 1,
    runId: 'live',
    state: 'running' as const,
    stage: 'writing' as const,
    failureCode: null,
  };
  const first = candidate();
  const later = candidate({ operationId: 'later' });
  deps.coordinator.inspect
    .mockResolvedValueOnce(snapshot({ phase: 'running', jobs: [active] }))
    .mockResolvedValueOnce(
      snapshot({ phase: 'running', jobs: [active, { ...active, operationId: first.operationId }] })
    );
  deps.discoverDue.mockResolvedValue({ candidates: [first, later], progress: progress() });
  await createSyncQueueRetryWakeup(deps).run();
  expect(deps.coordinator.start).toHaveBeenCalledExactlyOnceWith({
    scope,
    authorization,
    operationId: first.operationId,
    expectedRevision: first.revision,
  });
  expect(deps.coordinator.inspect).toHaveBeenCalledTimes(2);
  expect(deps.deferDue).toHaveBeenCalledExactlyOnceWith(later);
});

it.each(['alarm', 'load', 'initialize', 'discover', 'inspect', 'start'] as const)(
  'contains %s failure with a fixed diagnostic and allows a later pass',
  async (stage) => {
    const deps = dependencies();
    const error = new Error('private URL and credential detail');
    deps.discoverDue.mockResolvedValue({ candidates: [candidate()], progress: progress() });
    if (stage === 'alarm') {
      deps.createAlarm.mockRejectedValueOnce(error);
      deps.getAlarm.mockResolvedValueOnce(null);
    }
    if (stage === 'load') deps.loadConnection.mockRejectedValueOnce(error);
    if (stage === 'initialize') {
      deps.loadProgress.mockResolvedValueOnce(null);
      deps.initializePage.mockRejectedValueOnce(error);
    }
    if (stage === 'discover') deps.discoverDue.mockRejectedValueOnce(error);
    if (stage === 'inspect') deps.coordinator.inspect.mockRejectedValueOnce(error);
    if (stage === 'start') deps.coordinator.start.mockRejectedValueOnce(error);
    const owner = createSyncQueueRetryWakeup(deps);
    await expect(owner.run()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith('Sync queue retry deferred');
    await owner.run();
    expect(deps.coordinator.start).toHaveBeenCalled();
  }
);

it('disposes pending work and unregisters without clearing restart state', async () => {
  const deps = dependencies();
  const unsubscribe = vi.fn();
  deps.subscribeAlarm.mockReturnValue(unsubscribe);
  const loaded = deferred<SyncConnectionMetadata | null>();
  deps.loadConnection.mockReturnValueOnce(loaded.promise);
  const entered = deferred<void>();
  deps.getAlarm.mockImplementationOnce(async () => {
    entered.resolve();
    return { periodInMinutes: 1 };
  });
  const owner = createSyncQueueRetryWakeup(deps);
  const work = owner.run();
  await entered.promise;
  owner.dispose();
  loaded.resolve(connection());
  await work;
  await owner.run();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(deps.discoverDue).not.toHaveBeenCalled();
});

it('registers the browser startup event to recover a missing alarm without another extension event', async () => {
  const deps = dependencies();
  deps.getAlarm.mockResolvedValue(undefined);
  const owner = createSyncQueueRetryWakeup(deps);
  expect(deps.subscribeStartup).toHaveBeenCalledOnce();
  deps.subscribeStartup.mock.calls[0]![0]();
  await owner.run();
  expect(deps.createAlarm).toHaveBeenCalledExactlyOnceWith('sniptale:sync-queue-retry', {
    periodInMinutes: 1,
  });
  const unsubscribe = deps.subscribeStartup.mock.results[0]!.value;
  owner.dispose();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('reconciles committed captures before due discovery without requiring a save notification', async () => {
  const deps = dependencies();
  const reached = deferred<void>();
  const release = deferred<{ enqueued: number; existing: number; refused: number }>();
  deps.reconcileCaptures.mockImplementationOnce(() => {
    reached.resolve();
    return release.promise;
  });
  const owner = createSyncQueueRetryWakeup(deps);
  const running = owner.run();
  await reached.promise;
  expect(deps.reconcileCaptures).toHaveBeenCalledExactlyOnceWith(scope, authorization);
  expect(deps.loadProgress).not.toHaveBeenCalled();
  expect(deps.discoverDue).not.toHaveBeenCalled();
  release.resolve({ enqueued: 2, existing: 1, refused: 0 });
  await running;
  expect(deps.discoverDue).toHaveBeenCalledWith(scope, authorization, 16);
  owner.dispose();
});

it('preserves queued retries when reconciliation refuses and logs only a fixed message', async () => {
  const deps = dependencies();
  deps.reconcileCaptures.mockRejectedValueOnce(new Error('private endpoint and secret'));
  deps.discoverDue.mockResolvedValue({ candidates: [candidate()], progress: progress() });
  const owner = createSyncQueueRetryWakeup(deps);
  await owner.run();
  expect(deps.coordinator.start).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledExactlyOnceWith('Sync capture enqueue deferred');
  await owner.run();
  expect(deps.reconcileCaptures).toHaveBeenCalledTimes(2);
  owner.dispose();
});

it('does not discover or dispatch after disposal while capture reconciliation is pending', async () => {
  const deps = dependencies();
  const reached = deferred<void>();
  const release = deferred<{ enqueued: number; existing: number; refused: number }>();
  deps.reconcileCaptures.mockImplementationOnce(() => {
    reached.resolve();
    return release.promise;
  });
  const owner = createSyncQueueRetryWakeup(deps);
  const running = owner.run();
  await reached.promise;
  owner.dispose();
  release.resolve({ enqueued: 1, existing: 0, refused: 0 });
  await running;
  expect(deps.loadProgress).not.toHaveBeenCalled();
  expect(deps.discoverDue).not.toHaveBeenCalled();
  expect(deps.coordinator.start).not.toHaveBeenCalled();
});

it('continues valid due work after a per-capture refusal without leaking capture details', async () => {
  const deps = dependencies();
  deps.reconcileCaptures.mockResolvedValue({ enqueued: 1, existing: 0, refused: 1 });
  deps.discoverDue.mockResolvedValue({ candidates: [candidate()], progress: progress() });
  const owner = createSyncQueueRetryWakeup(deps);
  await owner.run();
  expect(deps.coordinator.start).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledExactlyOnceWith('Sync capture enqueue deferred');
  owner.dispose();
});

it('preserves legacy explicit queue retries without enabling automatic capture discovery', async () => {
  const deps = dependencies();
  const { workspace, ...legacy } = connection();
  void workspace;
  deps.loadConnection.mockResolvedValue(legacy);
  deps.discoverDue.mockResolvedValue({ candidates: [candidate()], progress: progress() });
  const owner = createSyncQueueRetryWakeup(deps);
  await owner.run();
  expect(deps.reconcileCaptures).not.toHaveBeenCalled();
  expect(deps.discoverDue).toHaveBeenCalledWith(scope, authorization, 16);
  expect(deps.coordinator.start).toHaveBeenCalledOnce();
  owner.dispose();
});
