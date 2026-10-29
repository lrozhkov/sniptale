import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type { SyncQueueOperation } from '../../composition/persistence/sync-capture/queue-model';
import type {
  loadSyncConnection,
  loadSyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/store';
import type { loadSyncQueueOperation } from '../../composition/persistence/sync-capture/queue';
import type { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import type { createDiagnosticPortWriter } from '../../platform/runtime-messaging/diagnostic-capture';
import type { releasePublishedOutgoing } from '../../workflows/sync-transfer/outgoing';
import type { refreshPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-refresh';
import type { runSyncQueueOperation } from '../../workflows/sync-transfer/queue';
import type { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import { DIAGNOSTIC_LOG_PORT } from '../../contracts/diagnostics';
import { SyncRemoteError, type SyncRemoteStore } from '../../workflows/sync-transfer/remote-store';
import { createSyncQueueExecution, createSyncWorkspaceExecution } from './execution';
import type { verifySyncWorkspaceIdentity } from '../../workflows/sync-transfer/workspace';
import type { createWebdavWorkspaceCreation } from '../../workflows/sync-transfer/webdav-workspace';
import type { createWebdavWorkspaceJoin } from '../../workflows/sync-transfer/webdav-workspace-join';
import type { SyncExecutionInput } from './executor';

const mocks = vi.hoisted(() => ({
  verifyWorkspace: vi.fn<typeof verifySyncWorkspaceIdentity>(),
  join: vi.fn<typeof createWebdavWorkspaceJoin>(),
  joinRun: vi.fn<ReturnType<typeof createWebdavWorkspaceJoin>['run']>(),
  workspace: vi.fn<typeof createWebdavWorkspaceCreation>(),
  workspaceRun: vi.fn<ReturnType<typeof createWebdavWorkspaceCreation>['run']>(),
  workspaceClose: vi.fn<() => Promise<void>>(),
  database: vi.fn<() => Promise<{ get(store: string, key: string): Promise<unknown> }>>(),
  get: vi.fn<(store: string, key: string) => Promise<unknown>>(),
  connection: vi.fn<typeof loadSyncConnection>(),
  authentication: vi.fn<typeof loadSyncConnectionAuthentication>(),
  queue: vi.fn<typeof loadSyncQueueOperation>(),
  requests: vi.fn<typeof createSyncConnectionRequests>(),
  request: vi.fn<ReturnType<typeof createSyncConnectionRequests>['request']>(),
  close: vi.fn<() => Promise<void>>(),
  run: vi.fn<typeof runSyncQueueOperation>(),
  release: vi.fn<typeof releasePublishedOutgoing>(),
  refresh: vi.fn<typeof refreshPersistedSyncCatalog>(),
  webdav: vi.fn<typeof createWebdavRemoteStore>(),
  history: vi.fn<ReturnType<typeof createDiagnosticPortWriter>['send']>(),
  writer: vi.fn<typeof createDiagnosticPortWriter>(),
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: mocks.database,
  SYNC_CAPTURE_STORE: 'sync_capture',
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: mocks.connection,
  loadSyncConnectionAuthentication: mocks.authentication,
}));
vi.mock('../../composition/persistence/sync-capture/queue', () => ({
  loadSyncQueueOperation: mocks.queue,
}));
vi.mock('../../workflows/sync-transfer/connection-requests', () => ({
  createSyncConnectionRequests: mocks.requests,
}));
vi.mock('../../workflows/sync-transfer/catalog-refresh', () => ({
  refreshPersistedSyncCatalog: mocks.refresh,
}));
vi.mock('../../workflows/sync-transfer/outgoing', () => ({
  releasePublishedOutgoing: mocks.release,
}));
vi.mock('../../workflows/sync-transfer/queue', () => ({ runSyncQueueOperation: mocks.run }));
vi.mock('../../platform/runtime-messaging/diagnostic-capture', () => ({
  createDiagnosticPortWriter: mocks.writer,
}));
vi.mock('../../workflows/sync-transfer/workspace', () => ({
  verifySyncWorkspaceIdentity: mocks.verifyWorkspace,
}));
vi.mock('../../workflows/sync-transfer/webdav-workspace-join', () => ({
  createWebdavWorkspaceJoin: mocks.join,
}));
vi.mock('../../workflows/sync-transfer/webdav-workspace', () => ({
  createWebdavWorkspaceCreation: mocks.workspace,
}));
vi.mock('../../workflows/sync-transfer/webdav', () => ({ createWebdavRemoteStore: mocks.webdav }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function input(): SyncExecutionInput {
  return {
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 },
    operationId: 'operation',
    expectedRevision: 3,
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  };
}
function connection(): SyncConnectionMetadata {
  const selected = input();
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...selected.scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example/root/',
      accountId: 'user',
    },
    identity: selected.authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
}
function operation(overrides: Partial<SyncQueueOperation> = {}): SyncQueueOperation {
  return {
    ...input().scope,
    version: 1,
    kind: 'queue-operation',
    key: 'queue-operation',
    operationId: 'operation',
    captureKey: 'native-capture',
    captureSha256: 'a'.repeat(64),
    rootKey: 'root',
    generation: 1,
    revision: 3,
    status: 'queued',
    stage: 'queued',
    runId: null,
    authorization: null,
    writeStarted: false,
    outcome: 'none',
    attemptId: null,
    failureCode: null,
    nextDueAt: null,
    automaticRetryCount: 0,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
    ...overrides,
  };
}
const remote: SyncRemoteStore = {
  list: vi.fn(async () => ({ objects: [], prefixes: [], nextCursor: null })),
  stat: vi.fn(async () => ({ size: 0 })),
  read: vi.fn(async () => new ReadableStream<Uint8Array>()),
  write: vi.fn(async () => undefined),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifyWorkspace.mockResolvedValue({
    spaceId: 'space',
    bootstrapId: 'bootstrap',
    fingerprint: 'a'.repeat(64),
  });
  mocks.connection.mockResolvedValue(connection());
  mocks.authentication.mockResolvedValue({ kind: 'bearer', accessToken: 'first' });
  mocks.queue.mockResolvedValue(operation());
  mocks.database.mockResolvedValue({ get: mocks.get });
  mocks.close.mockResolvedValue(undefined);
  mocks.history.mockReturnValue(true);
  mocks.writer.mockReturnValue({ send: mocks.history, dispose: vi.fn() });
  mocks.request.mockImplementation((signal, issue) => issue(signal));
  mocks.requests.mockReturnValue({ request: mocks.request, close: mocks.close });
  mocks.webdav.mockResolvedValue(remote);
  mocks.run.mockResolvedValue({
    status: 'finished',
    operation: operation({ status: 'published', stage: 'published', outcome: 'verified' }),
  });
});

describe('native queue admission and authorization', () => {
  it('binds the native capture, connection request gate, queue selection and cancellation signal', async () => {
    const selected = input();
    const hasOriginPermission = vi.fn(async () => true);
    const execution = createSyncQueueExecution(selected, hasOriginPermission);
    expect(mocks.requests).toHaveBeenCalledExactlyOnceWith({
      identity: selected.authorization,
      hasOriginPermission,
    });
    expect(await execution.run()).toEqual({
      containment: 'contained',
      snapshot: { state: 'published', stage: 'published', runId: null, failureCode: null },
    });
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(selected.scope, selected.operationId);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.webdav).toHaveBeenCalledExactlyOnceWith(
      {
        rootUrl: 'https://dav.example/root/',
        authentication: expect.any(Function),
        request: mocks.request,
      },
      selected.signal
    );
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith({
      scope: selected.scope,
      authorization: selected.authorization,
      operationId: selected.operationId,
      expectedRevision: 3,
      remote,
      signal: selected.signal,
      loadCatalog: expect.any(Function),
      authorize: expect.any(Function),
    });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(execution.drain).toBe(mocks.close);
    expect(hasOriginPermission).not.toHaveBeenCalled();
  });

  it('resolves fresh credentials for each transport request and rechecks current native authorization', async () => {
    const selected = input();
    await createSyncQueueExecution(selected, async () => true).run();
    const options = mocks.webdav.mock.calls[0]?.[0];
    if (!options || typeof options.authentication !== 'function')
      throw new Error('Missing credential resolver.');
    expect(mocks.authentication).not.toHaveBeenCalled();
    expect(await options.authentication()).toEqual({ kind: 'bearer', accessToken: 'first' });
    mocks.authentication.mockResolvedValueOnce({ kind: 'bearer', accessToken: 'replacement' });
    expect(await options.authentication()).toEqual({ kind: 'bearer', accessToken: 'replacement' });
    expect(mocks.authentication.mock.calls).toEqual([
      [selected.authorization],
      [selected.authorization],
    ]);
    const admitted = mocks.run.mock.calls[0]?.[0];
    if (!admitted) throw new Error('Missing native queue invocation.');
    await admitted.authorize();
    mocks.connection.mockResolvedValueOnce({ ...connection(), phase: 'paused' });
    await expect(admitted.authorize()).rejects.toMatchObject({ code: 'authentication' });
  });

  it('checks a selected workspace only from native queue admission and coalesces concurrent effects', async () => {
    const workspace = { spaceId: 'space', bootstrapId: 'bootstrap', fingerprint: 'a'.repeat(64) };
    mocks.connection.mockResolvedValue({ ...connection(), workspace });
    const held = deferred<void>();
    const checking = deferred<void>();
    mocks.verifyWorkspace.mockImplementation(async () => {
      checking.resolve();
      await held.promise;
      return workspace;
    });
    const effect = vi.fn();
    mocks.run.mockImplementation(async (selected) => {
      expect(mocks.verifyWorkspace).not.toHaveBeenCalled();
      const first = selected.authorize().then(effect);
      const second = selected.authorize().then(effect);
      await checking.promise;
      expect(mocks.verifyWorkspace).toHaveBeenCalledOnce();
      expect(effect).not.toHaveBeenCalled();
      expect(mocks.verifyWorkspace).toHaveBeenCalledWith(remote, workspace, selected.signal);
      held.resolve();
      await Promise.all([first, second]);
      await selected.authorize();
      return { status: 'finished', operation: operation({ status: 'published' }) };
    });
    await createSyncQueueExecution(input(), async () => true).run();
    expect(mocks.verifyWorkspace).toHaveBeenCalledOnce();
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('does not check a marker for a legacy connection', async () => {
    mocks.run.mockImplementation(async (selected) => {
      await selected.authorize();
      return { status: 'finished', operation: operation({ status: 'published' }) };
    });
    await createSyncQueueExecution(input(), async () => true).run();
    expect(mocks.verifyWorkspace).not.toHaveBeenCalled();
  });

  it('rejects admission if the connection changes while marker verification is pending', async () => {
    const workspace = { spaceId: 'space', bootstrapId: 'bootstrap', fingerprint: 'a'.repeat(64) };
    mocks.connection.mockResolvedValue({ ...connection(), workspace });
    mocks.verifyWorkspace.mockImplementation(async () => {
      mocks.connection.mockResolvedValue({ ...connection(), phase: 'paused', workspace });
      return workspace;
    });
    mocks.run.mockImplementation(async (selected) => {
      await expect(selected.authorize()).rejects.toMatchObject({ code: 'authentication' });
      return {
        status: 'finished',
        operation: operation({ status: 'failed', failureCode: 'authentication' }),
      };
    });
    await createSyncQueueExecution(input(), async () => true).run();
    expect(mocks.verifyWorkspace).toHaveBeenCalledOnce();
  });

  it.each(['missing', 'paused', 'identity', 'space', 'generation', 'profile'] as const)(
    'refuses %s native authorization before client creation',
    async (mismatch) => {
      const value = connection();
      switch (mismatch) {
        case 'missing':
          mocks.connection.mockResolvedValue(null);
          break;
        case 'paused':
          value.phase = 'paused';
          mocks.connection.mockResolvedValue(value);
          break;
        case 'identity':
          value.identity.revision += 1;
          mocks.connection.mockResolvedValue(value);
          break;
        case 'space':
          value.binding.spaceId = 'replacement';
          mocks.connection.mockResolvedValue(value);
          break;
        case 'generation':
          value.binding.connectionGeneration += 1;
          mocks.connection.mockResolvedValue(value);
          break;
        case 'profile':
          value.binding.profileCreatedAt += 1;
          mocks.connection.mockResolvedValue(value);
          break;
      }
      expect(await createSyncQueueExecution(input(), async () => true).run()).toMatchObject({
        containment: 'contained',
        snapshot: { state: 'failed', failureCode: 'authentication' },
      });
      expect(mocks.webdav).not.toHaveBeenCalled();
      expect(mocks.queue).not.toHaveBeenCalled();
      expect(mocks.database).not.toHaveBeenCalled();
      expect(mocks.authentication).not.toHaveBeenCalled();
      expect(mocks.close).toHaveBeenCalledOnce();
    }
  );

  it.each(['missing', 'stale'] as const)(
    'refuses a missing or stale queue selection',
    async (state) => {
      if (state === 'missing') mocks.queue.mockRejectedValue(new Error('Missing queue operation.'));
      else mocks.queue.mockResolvedValue(operation({ revision: 4 }));
      expect(await createSyncQueueExecution(input(), async () => true).run()).toMatchObject({
        containment: 'contained',
        snapshot: { state: 'failed', failureCode: 'internal' },
      });
      expect(mocks.database).not.toHaveBeenCalled();
      expect(mocks.webdav).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.close).toHaveBeenCalledOnce();
    }
  );

  it('retains the original scope and authorization if the caller mutates its selection during IO', async () => {
    const selected = input();
    const expected = structuredClone({
      scope: selected.scope,
      authorization: selected.authorization,
    });
    const held = deferred<SyncConnectionMetadata | null>();
    mocks.connection.mockReturnValueOnce(held.promise);
    const execution = createSyncQueueExecution(selected, async () => true);
    const completion = execution.run();
    selected.scope.connectionGeneration = 99;
    selected.authorization.revision = 99;
    held.resolve(connection());
    expect(await completion).toMatchObject({
      containment: 'contained',
      snapshot: { state: 'published' },
    });
    expect(mocks.run.mock.calls[0]?.[0]).toMatchObject(expected);
  });

  it('checks cancellation before any native read or client creation', async () => {
    const controller = new AbortController();
    controller.abort();
    const selected = { ...input(), signal: controller.signal };
    expect(await createSyncQueueExecution(selected, async () => true).run()).toMatchObject({
      containment: 'contained',
      snapshot: { state: 'interrupted', failureCode: 'interrupted' },
    });
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.webdav).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('native queue containment and outcomes', () => {
  it('waits for request closure after a workflow failure before reporting containment', async () => {
    const closure = deferred<void>();
    const closing = deferred<void>();
    mocks.run.mockRejectedValueOnce(new SyncRemoteError('access-denied'));
    mocks.close.mockImplementationOnce(() => {
      closing.resolve();
      return closure.promise;
    });
    let settled = false;
    const completion = createSyncQueueExecution(input(), async () => true)
      .run()
      .then((result) => {
        settled = true;
        return result;
      });
    await closing.promise;
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    closure.resolve();
    expect(await completion).toMatchObject({
      containment: 'contained',
      snapshot: { state: 'failed', failureCode: 'access-denied' },
    });
  });

  it('reports unsafe containment when the request owner cannot close and exposes drain failure', async () => {
    mocks.close.mockRejectedValue(new Error('Native reader could not be canceled.'));
    const execution = createSyncQueueExecution(input(), async () => true);
    expect(await execution.run()).toMatchObject({
      containment: 'unsafe',
      snapshot: { state: 'published' },
    });
    await expect(execution.drain()).rejects.toThrow('Native reader could not be canceled.');
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });

  it.each(['interrupted', 'failed'] as const)('projects the native %s outcome', async (status) => {
    mocks.run.mockResolvedValueOnce({
      status: 'finished',
      operation: operation({ status, stage: 'writing', failureCode: 'interrupted' }),
    });
    expect(await createSyncQueueExecution(input(), async () => true).run()).toEqual({
      containment: 'contained',
      snapshot: { state: status, stage: 'writing', runId: null, failureCode: 'interrupted' },
    });
  });

  it('projects native lock contention without starting another queue workflow', async () => {
    mocks.run.mockResolvedValueOnce({ status: 'busy' });
    expect(await createSyncQueueExecution(input(), async () => true).run()).toEqual({
      containment: 'contained',
      snapshot: { state: 'busy', stage: 'queued', runId: null, failureCode: null },
    });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

it('submits history hints after containment and preserves success when submission fails', async () => {
  mocks.history.mockReturnValue(false);
  mocks.history.mockImplementation(() => {
    expect(mocks.close).toHaveBeenCalledOnce();
    return false;
  });
  const selected = input();
  expect(await createSyncQueueExecution(selected, async () => true).run()).toMatchObject({
    snapshot: { state: 'published' },
    containment: 'contained',
  });
  expect(mocks.history.mock.calls).toEqual([
    [
      {
        kind: 'sync-queue',
        input: {
          scope: selected.scope,
          source: { kind: 'operation', operationId: selected.operationId },
        },
      },
    ],
    [{ kind: 'sync-queue', input: { scope: selected.scope, source: { kind: 'connection' } } }],
  ]);
});
it('does not begin history delivery after cancellation or failed request containment', async () => {
  const selected = input();
  mocks.close.mockRejectedValueOnce(new Error('Native reader did not drain.'));
  expect(await createSyncQueueExecution(selected, async () => true).run()).toMatchObject({
    containment: 'unsafe',
  });
  expect(mocks.history).not.toHaveBeenCalled();
  mocks.close.mockResolvedValue(undefined);
  const controller = new AbortController();
  controller.abort();
  await createSyncQueueExecution(
    { ...selected, signal: controller.signal },
    async () => true
  ).run();
  expect(mocks.history).not.toHaveBeenCalled();
});

it('submits through actual runtime IPC when offscreen has no chrome.storage', async () => {
  const messages: unknown[] = [];
  const disconnected: (() => void)[] = [];
  const port = {
    postMessage: (raw: unknown) => {
      messages.push(raw);
    },
    disconnect: vi.fn(),
    onDisconnect: {
      addListener: (listener: () => void) => {
        disconnected.push(listener);
      },
      removeListener: vi.fn(),
    },
  };
  const connect = vi.fn(() => port);
  vi.stubGlobal('chrome', { runtime: { connect } });
  const actual = await vi.importActual<
    typeof import('../../platform/runtime-messaging/diagnostic-capture')
  >('../../platform/runtime-messaging/diagnostic-capture');
  mocks.writer.mockImplementation(actual.createDiagnosticPortWriter);
  try {
    const selected = input();
    expect(await createSyncQueueExecution(selected, async () => true).run()).toMatchObject({
      containment: 'contained',
      snapshot: { state: 'published' },
    });
    expect(connect).toHaveBeenCalledExactlyOnceWith({ name: DIAGNOSTIC_LOG_PORT });
    expect(messages).toEqual([
      {
        kind: 'sync-queue',
        input: {
          scope: selected.scope,
          source: { kind: 'operation', operationId: selected.operationId },
        },
      },
      { kind: 'sync-queue', input: { scope: selected.scope, source: { kind: 'connection' } } },
    ]);
    expect(JSON.stringify(messages)).not.toContain('native-capture');
    disconnected[0]!();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('workspace execution adapter', () => {
  function workspaceInput() {
    return {
      source: { kind: 'allocation' as const, identity: input().authorization },
      authentication: { kind: 'bearer' as const, accessToken: 'private-workspace-secret' },
    };
  }
  beforeEach(() => {
    mocks.workspace.mockReturnValue({ run: mocks.workspaceRun, close: mocks.workspaceClose });
    mocks.join.mockReturnValue({ run: mocks.joinRun, close: mocks.workspaceClose });
    mocks.workspaceClose.mockResolvedValue(undefined);
  });

  it.each(['join', 'allocation'] as const)('routes %s through the existing owner', async (kind) => {
    const selected = { ...workspaceInput(), source: { kind, identity: input().authorization } };
    const permission = vi.fn(async () => true);
    const execution = createSyncWorkspaceExecution(selected, permission);
    const factory = kind === 'join' ? mocks.join : mocks.workspace;
    expect(factory).toHaveBeenCalledExactlyOnceWith({
      identity: selected.source.identity,
      authentication: selected.authentication,
      hasOriginPermission: permission,
    });
    expect(await execution.run()).toEqual({
      snapshot: { state: 'ready', failureCode: null },
      containment: 'contained',
    });
  });

  it.each([
    ['marker-missing', 'invalid-workspace'],
    ['binding-mismatch', 'invalid-workspace'],
    ['unsupported-format', 'invalid-workspace'],
    ['unavailable', 'temporary'],
    ['cancelled', 'interrupted'],
  ])('contains JOIN %s failures', async (code, failureCode) => {
    mocks.joinRun.mockRejectedValue(Object.assign(new Error('private'), { code }));
    const execution = createSyncWorkspaceExecution(
      { ...workspaceInput(), source: { kind: 'join', identity: input().authorization } },
      async () => true
    );
    expect(await execution.run()).toEqual({
      snapshot: { state: failureCode === 'interrupted' ? 'interrupted' : 'failed', failureCode },
      containment: 'contained',
    });
    expect(mocks.workspaceClose).toHaveBeenCalledOnce();
  });

  it('retains unsafe JOIN containment when its request drain fails', async () => {
    mocks.joinRun.mockRejectedValue(
      Object.assign(new Error('private'), { code: 'binding-mismatch' })
    );
    mocks.workspaceClose.mockRejectedValue(new Error('private drain'));
    const execution = createSyncWorkspaceExecution(
      { ...workspaceInput(), source: { kind: 'join', identity: input().authorization } },
      async () => true
    );
    expect(await execution.run()).toMatchObject({
      containment: 'unsafe',
      snapshot: { failureCode: 'invalid-workspace' },
    });
  });

  it('constructs the existing creation owner synchronously and returns only safe terminal evidence', async () => {
    const selected = workspaceInput();
    const permission = vi.fn(async () => true);
    const execution = createSyncWorkspaceExecution(selected, permission);
    expect(mocks.workspace).toHaveBeenCalledExactlyOnceWith({
      identity: selected.source.identity,
      authentication: selected.authentication,
      hasOriginPermission: permission,
    });
    expect(mocks.workspaceRun).not.toHaveBeenCalled();
    const result = await execution.run();
    expect(result).toEqual({
      snapshot: { state: 'ready', failureCode: null },
      containment: 'contained',
    });
    expect(JSON.stringify(result)).not.toContain('private-workspace-secret');
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.workspaceClose).toHaveBeenCalledOnce();
  });

  it.each([
    ['authentication', 'authentication'],
    ['access-denied', 'access-denied'],
    ['storage-full', 'storage-full'],
    ['transport', 'temporary'],
    ['allocation-refused', 'invalid-workspace'],
    ['containment-failed', 'internal'],
  ])('projects fixed %s failures without provider details', async (code, expected) => {
    mocks.workspaceRun.mockRejectedValue(
      Object.assign(new Error('private-workspace-secret'), { code })
    );
    expect(await createSyncWorkspaceExecution(workspaceInput(), async () => true).run()).toEqual({
      snapshot: { state: 'failed', failureCode: expected },
      containment: 'contained',
    });
  });

  it('reports unsafe containment when creation cannot drain', async () => {
    mocks.workspaceRun.mockRejectedValue(new Error('private error'));
    mocks.workspaceClose.mockRejectedValue(new Error('private body error'));
    const execution = createSyncWorkspaceExecution(workspaceInput(), async () => true);
    expect(await execution.run()).toMatchObject({
      containment: 'unsafe',
      snapshot: { state: 'failed', failureCode: 'internal' },
    });
    await expect(execution.drain()).rejects.toThrow('private body error');
  });

  it('drains before the first await and projects cancellation after held creation fails', async () => {
    const held = deferred<void>();
    mocks.workspaceRun.mockImplementation(async () => {
      await held.promise;
      throw new Error('private cancellation');
    });
    const execution = createSyncWorkspaceExecution(workspaceInput(), async () => true);
    const result = execution.run();
    const drain = execution.drain();
    expect(mocks.workspaceClose).toHaveBeenCalledOnce();
    held.resolve();
    await drain;
    expect(await result).toEqual({
      snapshot: { state: 'interrupted', failureCode: 'interrupted' },
      containment: 'contained',
    });
  });
});

describe('queue publication retirement and reconciliation', () => {
  it.each(['temporary', 'reader-busy'])(
    'retains verified publication when advisory retirement refuses: %s',
    async (code) => {
      mocks.release.mockRejectedValueOnce(new Error(code));
      const selected = input();
      await expect(
        createSyncQueueExecution(selected, async () => true).run()
      ).resolves.toMatchObject({
        snapshot: { state: 'published', failureCode: null },
        containment: 'contained',
      });
      expect(mocks.release).toHaveBeenCalledExactlyOnceWith(
        selected.scope.spaceId,
        selected.operationId,
        selected.authorization,
        remote,
        selected.signal
      );
      expect(mocks.close).toHaveBeenCalledOnce();
    }
  );

  it('does not release protection after failed or busy queue execution', async () => {
    mocks.run.mockResolvedValueOnce({ status: 'busy' });
    await createSyncQueueExecution(input(), async () => true).run();
    mocks.run.mockResolvedValueOnce({
      status: 'finished',
      operation: operation({ status: 'failed', failureCode: 'temporary' }),
    });
    await createSyncQueueExecution(input(), async () => true).run();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('does not release protection after authority is paused following publication', async () => {
    mocks.connection
      .mockResolvedValueOnce(connection())
      .mockResolvedValueOnce({ ...connection(), phase: 'paused' });
    await expect(createSyncQueueExecution(input(), async () => true).run()).resolves.toMatchObject({
      snapshot: { state: 'published' },
      containment: 'contained',
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('loads the fresh catalog inside the native queue run for publication reconciliation', async () => {
    const selected = input();
    const catalog: Awaited<ReturnType<typeof refreshPersistedSyncCatalog>> = {
      operations: new Map(),
      roots: new Map(),
      quarantined: [],
      pending: [],
      invalidOperations: [],
      invalid: [],
      metadataBytes: 0,
      pages: 1,
    };
    mocks.refresh.mockResolvedValue(catalog);
    mocks.run.mockImplementation(async (run) => {
      expect(await run.loadCatalog?.(remote)).toBe(catalog);
      expect(mocks.close).not.toHaveBeenCalled();
      return {
        status: 'finished',
        operation: operation({ status: 'published', stage: 'published', outcome: 'verified' }),
      };
    });
    expect((await createSyncQueueExecution(selected, async () => true).run()).snapshot.state).toBe(
      'published'
    );
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(
      remote,
      selected.scope.spaceId,
      selected.scope.connectionGeneration,
      selected.signal
    );
  });
});
