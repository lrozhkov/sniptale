import {
  SecretProtectionAdmissionPermit,
  SecretProtectionLockedError,
} from '../../../../composition/persistence/secret-protection/model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../../../composition/persistence/remote-connection/model';
import type { SyncConnectionCoordinatorDependencies } from '../../../sync-connection/coordinator';
import type { SyncQueueRetryWakeupDependencies } from '../../../sync-connection/retry-wakeup';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { initializeSyncConnectionRuntime } from './sync-connection';

const protection: import('../../../../composition/persistence/secret-protection/model').SecretProtectionService =
  {
    prepare: async () => undefined,
    readKey: async () => null,
    withAdmission: async (_participant, operation) =>
      SecretProtectionAdmissionPermit.run((permit) => operation(null, permit)),
    getEpoch: async () => 0,
    readPreparedStatus: async () => null,
    readStatus: async () => ({
      isEnabled: false,
      isUnlocked: true,
      mode: 'transparent',
      participants: { ai: false, webdav: false },
    }),
    enable: async () => undefined,
    disable: async () => undefined,
    unlock: async () => undefined,
    lock: async () => undefined,
    changePassphrase: async () => undefined,
    reset: async () => undefined,
    resetParticipant: async () => undefined,
    clearMemory: () => undefined,
    reserveErasure: () => ({ release: () => undefined, prepare: async () => undefined }),
  };

const ports = vi.hoisted(() => ({
  loadConnection: vi.fn<() => Promise<SyncConnectionMetadata | null>>(),
  readControl:
    vi.fn<
      typeof import('../../../../composition/persistence/secret-protection/transition.store').readSecretProtectionControl
    >(),
  authentication:
    vi.fn<
      typeof import('../../../../composition/persistence/remote-connection/store').loadSyncConnectionAuthentication
    >(),
  profileBinding: vi.fn<() => Promise<string | null>>(),
  permission: vi.fn(async () => true),
  captureDatabase: vi.fn<() => object | null>(),
  summary:
    vi.fn<
      typeof import('../../../../composition/persistence/sync-capture/queue-summary').readSyncQueueSummary
    >(),
  activity:
    vi.fn<
      ReturnType<
        typeof import('../../../sync-connection/coordinator').createSyncConnectionCoordinator
      >['observeActivity']
    >(),
  inspect: vi.fn<() => Promise<unknown>>(),
  productCommand: vi.fn(),
  createCoordinator: vi.fn<(deps: SyncConnectionCoordinatorDependencies) => unknown>(),
  retiringHistory: vi.fn(),
  completeLocalOnly: vi.fn(),
  logInfo: vi.fn(),
  createGateway: vi.fn(),
  configureProductRoute:
    vi.fn<typeof import('../../../sync-connection/product-route').configureSyncProductRoute>(),
  createRetry: vi.fn<(deps: SyncQueueRetryWakeupDependencies) => unknown>(),
  runRetry: vi.fn<() => Promise<void>>(),
  resumeLocked: vi.fn(),
  createJoin: vi.fn(),
  loadJoin: vi.fn(),
  startWorkspace: vi.fn(async () => ({ executorId: 'executor', executorRevision: 1 })),
}));
vi.mock('../../../../workflows/sync-transfer/queue-history', () => ({
  deliverRetiringSyncQueueHistory: ports.retiringHistory,
}));
vi.mock('../../../../composition/persistence/remote-connection/local-only', () => ({
  completeSyncLocalOnly: ports.completeLocalOnly,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ info: ports.logInfo, warn: vi.fn() }),
}));
vi.mock('../../../sync-connection/coordinator', () => ({
  createSyncConnectionCoordinator: ports.createCoordinator,
}));
vi.mock('../../../sync-connection/offscreen-gateway', () => ({
  createSyncOffscreenGateway: ports.createGateway,
}));
vi.mock('../../../sync-connection/retry-wakeup', () => ({
  createSyncQueueRetryWakeup: ports.createRetry,
}));
vi.mock('../../../sync-connection/product-route', () => ({
  configureSyncProductRoute: ports.configureProductRoute,
}));
vi.mock('../../../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: ports.loadConnection,
  readPreparedSyncConnection: ports.loadConnection,
  loadSyncConnectionAuthentication: ports.authentication,
  enrollSyncWorkspaceConnection: vi.fn(),
  commandSyncConnection: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-allocation', () => ({
  createSyncWorkspaceAllocation: vi.fn(),
  loadSyncWorkspaceAllocation: vi.fn(),
  revokeSyncWorkspaceAllocation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-join', () => ({
  createSyncWorkspaceJoin: ports.createJoin,
  loadSyncWorkspaceJoin: ports.loadJoin,
  revokeSyncWorkspaceJoin: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-selection', () => ({
  loadSyncWorkspaceSelection: vi.fn(),
}));
vi.mock('../../../../composition/persistence/sync-capture/queue-schedule', () => ({
  resumeSecretLockedSyncQueuePage: ports.resumeLocked,
  loadSyncQueueScheduleProgress: vi.fn(),
  initializeSyncQueueSchedulePage: vi.fn(),
  discoverDueSyncQueueOperations: vi.fn(),
  deferDueSyncQueueOperation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/sync-capture/enrollment', () => ({
  discoverInitialSyncRoots: vi.fn(),
}));
vi.mock('../../../../composition/persistence/sync-capture/queue-reconciliation', () => ({
  reconcileSyncQueueCaptures: vi.fn(),
}));
vi.mock('../../../../workflows/sync-transfer/queue', () => ({
  recoverInterruptedSyncQueueOperation: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { getContexts: vi.fn() },
  runtimeInfo: { getURL: (path: string) => 'chrome-extension://fixture/' + path },
}));
vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { contains: ports.permission, subscribeToRemoved: vi.fn() },
}));
vi.mock('../../../offscreen-document/service', () => ({
  ensureOffscreenDocument: vi.fn(),
  waitForOffscreenReady: vi.fn(),
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', () => ({
  getBackgroundRuntimeMessaging: vi.fn(),
}));
vi.mock('../../../application/privacy-erasure/composition', () => ({
  configureSyncPrivacyErasurePort: vi.fn(),
  configureSecretProtectionPrivacyErasurePort: vi.fn(),
  eraseLocalExtensionDataFromBackground: vi.fn(),
}));
vi.mock('../../../../platform/security-e2e-control', () => ({
  registerSecurityE2EControl: vi.fn(),
}));
vi.mock('../../../../platform/runtime-messaging/sync-product-client', () => ({
  subscribeToSyncQueueSettled: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  capturePreparedDatabase: ports.captureDatabase,
}));
vi.mock('../../../../composition/persistence/sync-capture/queue-summary', () => ({
  readSyncQueueSummary: ports.summary,
}));
vi.mock(
  '../../../../composition/persistence/secret-protection/transition.store',
  async (original) => ({
    ...(await original<
      typeof import('../../../../composition/persistence/secret-protection/transition.store')
    >()),
    readSecretProtectionControl: ports.readControl,
    readPreparedSecretProtectionControl: ports.readControl,
  })
);
vi.mock(
  '../../../../composition/persistence/secret-protection/profile.store',
  async (original) => ({
    ...(await original<
      typeof import('../../../../composition/persistence/secret-protection/profile.store')
    >()),
    readSecretProtectionProfileBinding: ports.profileBinding,
  })
);
function connection(): SyncConnectionMetadata {
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
    },
    identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 },
    workspace: {
      spaceId: 'space',
      bootstrapId: '44444444-4444-4444-8444-444444444444',
      fingerprint: 'a'.repeat(64),
    },
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  ports.runRetry.mockResolvedValue(undefined);
  ports.readControl.mockResolvedValue({
    version: 1,
    epoch: 3,
    phase: 'stable',
    participants: { ai: false, webdav: null },
  });
  ports.profileBinding.mockResolvedValue('a'.repeat(64));
  ports.authentication.mockResolvedValue({
    kind: 'basic',
    username: 'fixture-user',
    password: 'fixture-password',
  });
  ports.permission.mockResolvedValue(true);
  ports.captureDatabase.mockReturnValue(null);
  ports.activity.mockResolvedValue({
    activity: 'idle',
    remote: { knowledge: 'unknown' },
    failureCode: null,
  });
  ports.loadConnection.mockResolvedValue(null);
  ports.resumeLocked.mockResolvedValue({ complete: true, afterKey: null, resumed: 0, scanned: 0 });
  ports.retiringHistory.mockResolvedValue(undefined);
  ports.completeLocalOnly.mockResolvedValue('delivered');
  ports.logInfo.mockReset();
  ports.inspect.mockResolvedValue(null);
  ports.createGateway.mockReturnValue({ startWorkspaceExecutor: ports.startWorkspace });
  ports.createCoordinator.mockReturnValue({
    inspect: ports.inspect,
    productCommand: ports.productCommand,
    observeActivity: ports.activity,
  });
  ports.createRetry.mockReturnValue({ run: ports.runRetry, dispose: vi.fn() });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('admits automatic incoming only for an active workspace and wakes enrollment', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  const deps = ports.createRetry.mock.calls[0]?.[0];
  if (!deps?.refreshIncoming) throw new Error('Missing incoming refresh port');
  const current = connection();
  ports.loadConnection.mockResolvedValue(current);
  await deps.refreshIncoming();
  expect(ports.productCommand).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
    kind: 'automatic-sync',
  });
  for (const snapshot of [
    { phase: 'stopping' },
    { phase: 'failed' },
    { phase: 'running', workspace: { state: 'running' } },
    { phase: 'running', products: [{ state: 'running' }] },
  ]) {
    ports.inspect.mockResolvedValue(snapshot);
    await deps.refreshIncoming();
  }
  ports.loadConnection.mockResolvedValue({ ...current, phase: 'paused' });
  await deps.refreshIncoming();
  const { workspace: ignored, ...legacy } = current;
  void ignored;
  ports.loadConnection.mockResolvedValue(legacy);
  await deps.refreshIncoming();
  expect(ports.productCommand).toHaveBeenCalledOnce();
  const wakeEnrollment = ports.configureProductRoute.mock.calls[0]?.[1];
  if (!wakeEnrollment) throw new Error('Missing enrollment wakeup');
  wakeEnrollment();
  expect(ports.runRetry).toHaveBeenCalledTimes(2);
});

function localOnlyCompletion() {
  initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  const complete = ports.createCoordinator.mock.calls[0]?.[0].completeLocalOnly;
  if (!complete) throw new Error('Missing local-only completion port');
  return complete;
}

it('waits for retiring history before atomic detach and passes the exact connection', async () => {
  let finish!: () => void;
  ports.retiringHistory.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  const current = { ...connection(), phase: 'paused' as const };
  const pending = localOnlyCompletion()(current);
  expect(ports.retiringHistory).toHaveBeenCalledExactlyOnceWith(current.binding);
  expect(ports.completeLocalOnly).not.toHaveBeenCalled();
  finish();
  await expect(pending).resolves.toBe('delivered');
  expect(ports.completeLocalOnly).toHaveBeenCalledExactlyOnceWith(current);
});

it.each(['history', 'detach'] as const)(
  'preserves %s failure during local-only retirement',
  async (stage) => {
    const error = new Error('Retirement refused');
    (stage === 'history' ? ports.retiringHistory : ports.completeLocalOnly).mockRejectedValueOnce(
      error
    );
    await expect(localOnlyCompletion()({ ...connection(), phase: 'paused' })).rejects.toBe(error);
    if (stage === 'history') expect(ports.completeLocalOnly).not.toHaveBeenCalled();
    expect(ports.logInfo).not.toHaveBeenCalled();
  }
);

it.each(['delivered', 'incomplete'] as const)(
  'keeps committed %s retirement when logging fails',
  async (history) => {
    ports.completeLocalOnly.mockResolvedValueOnce(history);
    ports.logInfo.mockImplementationOnce(() => {
      throw new Error('Logger unavailable');
    });
    await expect(localOnlyCompletion()({ ...connection(), phase: 'paused' })).resolves.toBe(
      history
    );
    expect(ports.logInfo).toHaveBeenCalledExactlyOnceWith(
      `sync.connection.local-only history=${history}`
    );
  }
);

it('requeues locked failures after unlock without forcing the checkpoint interval', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  ports.loadConnection.mockResolvedValue({ ...connection(), phase: 'paused' });
  ports.resumeLocked
    .mockResolvedValueOnce({ complete: false, afterKey: 'page-1', resumed: 64, scanned: 64 })
    .mockResolvedValueOnce({ complete: true, afterKey: 'page-2', resumed: 1, scanned: 1 });
  await runtime.resumeAfterUnlock();
  expect(ports.resumeLocked).toHaveBeenNthCalledWith(
    1,
    { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    connection().identity,
    null,
    64
  );
  expect(ports.resumeLocked).toHaveBeenNthCalledWith(
    2,
    { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    connection().identity,
    'page-1',
    64
  );
  expect(ports.productCommand).not.toHaveBeenCalled();
});

it('refuses foreground credential leases until startup containment completes', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prepare = vi.spyOn(protection, 'prepare').mockReturnValueOnce(pending);
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  const issue = ports.createGateway.mock.calls[0]?.[0].issueCredentialLease;
  if (!issue) throw new Error('Missing credential lease port');
  await expect(
    issue({
      offscreenStartupId: '11111111-1111-4111-8111-111111111111',
      executorId: '22222222-2222-4222-8222-222222222222',
      authorization: connection().identity,
    })
  ).rejects.toMatchObject({ reason: 'secrets-locked' });
  release();
  await runtime.ready;
  prepare.mockRestore();
});

it('wires a cold popup status read without native preparation, execution, or retry wakeup', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  const read = ports.configureProductRoute.mock.calls[0]?.[2];
  if (!read) throw new Error('Missing runtime projection');
  ports.loadConnection.mockClear();
  ports.inspect.mockClear();
  ports.productCommand.mockClear();
  ports.runRetry.mockClear();
  expect(await read()).toMatchObject({ configuration: 'unknown', issue: 'not-ready' });
  expect(ports.loadConnection).not.toHaveBeenCalled();
  expect(ports.inspect).not.toHaveBeenCalled();
  expect(ports.productCommand).not.toHaveBeenCalled();
  expect(ports.runRetry).not.toHaveBeenCalled();
});

it('passes search expected null and previous source into native CAS', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  const deps = ports.createCoordinator.mock.calls[0]?.[0];
  if (!deps?.createWorkspaceSelection) throw new Error('Missing selection owner');
  const previous = {
    kind: 'join' as const,
    identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 2 },
  };
  ports.createJoin.mockResolvedValue({ identity: { ...previous.identity, revision: 3 } });
  await deps.createWorkspaceSelection({
    kind: 'join',
    rootUrl: 'https://dav.example/root/',
    accountId: 'alice',
    expected: null,
    previous,
  });
  expect(ports.createJoin).toHaveBeenCalledExactlyOnceWith(
    { rootUrl: 'https://dav.example/root/', accountId: 'alice', expected: null },
    previous.identity
  );
  await deps.createWorkspaceSelection({
    kind: 'join',
    rootUrl: 'https://dav.example/root/',
    accountId: 'alice',
    expected: null,
    previous: null,
  });
  expect(ports.createJoin).toHaveBeenLastCalledWith(
    { rootUrl: 'https://dav.example/root/', accountId: 'alice', expected: null },
    null
  );
});
it('fences prepare for a native search with expected null and preserves explicit discovery', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  const deps = ports.createCoordinator.mock.calls[0]?.[0];
  if (!deps) throw new Error('Missing coordinator');
  const source = {
    kind: 'join' as const,
    identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 2 },
  };
  const input = {
    source,
    authentication: { kind: 'basic' as const, username: 'alice', password: 'secret' },
    offscreenStartupId: 'startup',
    executorId: 'executor',
    executorRevision: 1,
  };
  ports.loadJoin.mockResolvedValue({ identity: source.identity, expected: null });
  ports.startWorkspace.mockClear();
  await expect(deps.startWorkspaceExecutor(input)).rejects.toThrow('refused');
  expect(ports.startWorkspace).not.toHaveBeenCalled();
  await deps.startWorkspaceExecutor({ ...input, operation: 'discover' });
  expect(ports.startWorkspace).toHaveBeenCalledOnce();
  ports.loadJoin.mockResolvedValue({
    identity: source.identity,
    expected: { spaceId: 'space', bootstrapId: 'bootstrap', fingerprint: 'a'.repeat(64) },
  });
  await expect(deps.startWorkspaceExecutor({ ...input, operation: 'discover' })).rejects.toThrow(
    'refused'
  );
  await deps.startWorkspaceExecutor(input);
  expect(ports.startWorkspace).toHaveBeenCalledTimes(2);
  const allocation = {
    ...input,
    source: { kind: 'allocation' as const, identity: source.identity },
  };
  await expect(
    deps.startWorkspaceExecutor({ ...allocation, operation: 'discover' })
  ).rejects.toThrow('discovery refused');
  expect(ports.startWorkspace).toHaveBeenCalledTimes(2);
  await deps.startWorkspaceExecutor(allocation);
  expect(ports.startWorkspace).toHaveBeenCalledTimes(3);
});

function leaseTarget() {
  return {
    offscreenStartupId: '33333333-3333-4333-8333-333333333333',
    executorId: '44444444-4444-4444-8444-444444444444',
    authorization: connection().identity,
  };
}
function issuePort() {
  const issue = ports.createGateway.mock.calls[0]?.[0].issueCredentialLease;
  if (!issue) throw new Error('Missing credential admission port');
  return issue;
}
function trustedSender() {
  return {
    url:
      'chrome-extension://fixture/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=' +
      leaseTarget().offscreenStartupId,
  };
}
function credentialResponse(
  runtime: ReturnType<typeof initializeSyncConnectionRuntime>,
  lease: unknown,
  sender: chrome.runtime.MessageSender = trustedSender()
) {
  return new Promise<unknown>((resolve) => {
    expect(
      runtime.credentialRoute(
        {
          type: 'SYNC_CONNECTION_CREDENTIAL',
          requestId: crypto.randomUUID(),
          credentialLease: lease,
        },
        sender,
        resolve
      )
    ).toBe(true);
  });
}
it('keeps wake dispatch closed on key refusal and recovers through the same admission port', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  const retry = ports.createRetry.mock.calls[0]?.[0];
  if (!retry?.canDispatch) throw new Error('Missing dispatch admission');
  const key = vi
    .spyOn(protection, 'readKey')
    .mockRejectedValueOnce(new SecretProtectionLockedError());
  expect(await retry.canDispatch()).toBe(false);
  expect(ports.productCommand).not.toHaveBeenCalled();
  key.mockResolvedValue(null);
  expect(await retry.canDispatch()).toBe(true);
});
it('refuses credentials after failed preparation and admits a fresh recovered worker lifetime', async () => {
  const prepare = vi
    .spyOn(protection, 'prepare')
    .mockRejectedValueOnce(new Error('Contained startup failure'));
  const failed = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await failed.ready;
  await expect(issuePort()(leaseTarget())).rejects.toMatchObject({ reason: 'secrets-locked' });
  ports.createGateway.mockClear();
  prepare.mockResolvedValue(undefined);
  const recovered = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await recovered.ready;
  ports.loadConnection.mockResolvedValue(connection());
  await expect(issuePort()(leaseTarget())).resolves.toMatchObject(leaseTarget());
});
it.each([false, true])(
  'delivers current credentials only through the bound native admission: protected=%s',
  async (lockedProfile) => {
    const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
    await runtime.ready;
    const key = lockedProfile
      ? await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ])
      : null;
    vi.spyOn(protection, 'readKey').mockResolvedValue(key);
    vi.spyOn(protection, 'withAdmission').mockImplementation((_participant, operation) =>
      SecretProtectionAdmissionPermit.run((permit) => operation(key, permit))
    );
    ports.loadConnection.mockResolvedValue(connection());
    const lease = await issuePort()(leaseTarget());
    expect(await credentialResponse(runtime, lease)).toMatchObject({
      success: true,
      credentialLease: lease,
    });
    expect(ports.authentication).toHaveBeenCalledExactlyOnceWith(
      connection().identity,
      key,
      lockedProfile ? 'a'.repeat(64) : null
    );
    if (!lockedProfile) expect(ports.profileBinding).not.toHaveBeenCalled();
    ports.authentication.mockClear();
    const foreign = { url: trustedSender().url + '&ignored=1' };
    foreign.url = foreign.url.replace(
      leaseTarget().offscreenStartupId,
      '55555555-5555-4555-8555-555555555555'
    );
    expect(await credentialResponse(runtime, lease, foreign)).toMatchObject({ success: false });
    expect(
      await credentialResponse(runtime, lease, { url: 'https://foreign.invalid/' })
    ).toMatchObject({ success: false });
    expect(ports.authentication).not.toHaveBeenCalled();
  }
);
it('rechecks the lease after a held credential read and refuses revocation before delivery', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  ports.loadConnection.mockResolvedValue(connection());
  const lease = await issuePort()(leaseTarget());
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: (value: Awaited<ReturnType<typeof ports.authentication>>) => void;
  ports.authentication.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const response = credentialResponse(runtime, lease);
  await reading;
  runtime.revokeCredentialLeases();
  finish({ kind: 'basic', username: 'fixture-user', password: 'late-fixture-password' });
  expect(await response).toMatchObject({ success: false });
});
it('projects locked origin refusal without treating an unknown key failure as a verified lock', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  ports.loadConnection.mockResolvedValue(connection());
  const lease = await issuePort()(leaseTarget());
  runtime.revokeCredentialLeases();
  const readKey = vi.spyOn(protection, 'readKey');
  for (const [error, expected] of [
    [
      new SecretProtectionLockedError(),
      { success: true, allowed: false, reason: 'secrets-locked' },
    ],
    [new Error('Unknown native refusal'), { success: true, allowed: false }],
  ] as const) {
    readKey.mockRejectedValue(error);
    const response = await new Promise<unknown>((resolve) => {
      expect(
        runtime.originPermissionRoute(
          {
            type: 'SYNC_CONNECTION_ORIGIN_PERMISSION',
            requestId: crypto.randomUUID(),
            authorization: connection().identity,
            credentialLease: lease,
            origin: 'https://dav.example.test',
          },
          trustedSender(),
          resolve
        )
      ).toBe(true);
    });
    expect(response).toEqual(expected);
  }
});
it('reads bound popup status without waking work or exposing local publication as remote completion', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  ports.captureDatabase.mockReturnValue({});
  ports.loadConnection.mockResolvedValue(connection());
  ports.summary.mockResolvedValue({
    knowledge: 'complete',
    configured: true,
    scope: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 },
    authorization: connection().identity,
    connection: 'active',
    counts: {
      pendingRoots: 0,
      nativeOperations: 0,
      preparedOperations: 0,
      publishedOperations: 1,
      queue: {
        queued: 0,
        running: 0,
        paused: 0,
        cancelled: 0,
        failed: 0,
        interrupted: 0,
        published: 1,
      },
    },
    minimumPendingDueAt: null,
    enrollmentComplete: true,
    localPublication: 'published',
  });
  vi.spyOn(protection, 'readPreparedStatus').mockResolvedValue({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
    participants: { ai: false, webdav: false },
  });
  const read = ports.configureProductRoute.mock.calls[0]?.[2];
  if (!read) throw new Error('Missing status reader');
  ports.runRetry.mockClear();
  ports.productCommand.mockClear();
  expect(await read()).toMatchObject({
    configuration: 'configured',
    localPublication: 'published',
    remote: { knowledge: 'unknown' },
  });
  expect(ports.activity).toHaveBeenCalledWith({
    scope: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 },
    authorization: connection().identity,
  });
  expect(ports.permission).toHaveBeenCalledWith({ origins: ['https://dav.example.test/*'] });
  expect(ports.runRetry).not.toHaveBeenCalled();
  expect(ports.productCommand).not.toHaveBeenCalled();
});
it('refuses a non-progressing unlock page without another wake or forced checkpoint', async () => {
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  ports.loadConnection.mockResolvedValue(connection());
  ports.resumeLocked.mockResolvedValue({ complete: false, afterKey: null, resumed: 0, scanned: 0 });
  ports.runRetry.mockClear();
  await expect(runtime.resumeAfterUnlock()).rejects.toThrow('did not advance');
  expect(ports.resumeLocked).toHaveBeenCalledOnce();
  expect(ports.runRetry).not.toHaveBeenCalled();
});

it('keeps locked startup work contained and resumes only after explicit unlock admission', async () => {
  const readKey = vi
    .spyOn(protection, 'readKey')
    .mockRejectedValue(new SecretProtectionLockedError());
  ports.loadConnection.mockResolvedValue(connection());
  const runtime = initializeSyncConnectionRuntime(createBackgroundRuntimeState(), protection);
  await runtime.ready;
  expect(ports.resumeLocked).not.toHaveBeenCalled();
  await expect(issuePort()(leaseTarget())).rejects.toMatchObject({ reason: 'secrets-locked' });
  ports.runRetry.mockClear();
  readKey.mockResolvedValue(null);
  await runtime.resumeAfterUnlock();
  expect(ports.resumeLocked).toHaveBeenCalledOnce();
  expect(ports.runRetry).toHaveBeenCalledOnce();
});
