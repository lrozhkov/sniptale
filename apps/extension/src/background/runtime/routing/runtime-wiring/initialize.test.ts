vi.mock('./startup', () => ({ runStartupMaintenance: vi.fn() }));
vi.mock('../../../page-access/lifecycle', () => ({ initializePageAccessLifecycle: vi.fn() }));
vi.mock('../../../page-recovery/ports', () => ({ registerPageRecoveryPorts: vi.fn() }));
vi.mock('../../../ai/audio/port', () => ({ registerAudioJobPorts: vi.fn() }));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncConnectionMetadata } from '../../../../composition/persistence/remote-connection/model';
import type { SyncWorkspaceAllocation } from '../../../../composition/persistence/remote-connection/workspace-allocation';

const {
  configureDownloadPort,
  configureAudioJobPrivacyErasurePort,
  configureSyncPrivacyErasurePort,
  eraseLocalExtensionDataFromBackground,
  registerContentTextPorts,
  configureNativeIngestionPrivacyErasureCleanupPort,
  configureScreenshotPrivacyErasureCleanupPort,
  executeDownloadBlob,
  nativeIngestionCleanupAdapter,
  registerInstallListener,
  registerExtensionCommandListener,
  registerAggregateEditorPresencePorts,
  registerWindowBoundsListener,
  registerVoiceInputPorts,
  registerVoiceInputTelemetryPorts,
  registerSecurityE2EControl,
  initializeNativeAppPermissionLifecycle,
  subscribeToLocaleChanges,
} = vi.hoisted(() => ({
  configureDownloadPort: vi.fn(),
  configureAudioJobPrivacyErasurePort: vi.fn(),
  configureSyncPrivacyErasurePort: vi.fn(),
  eraseLocalExtensionDataFromBackground: vi.fn(),
  registerContentTextPorts: vi.fn(),
  configureNativeIngestionPrivacyErasureCleanupPort: vi.fn(),
  configureScreenshotPrivacyErasureCleanupPort: vi.fn(),
  executeDownloadBlob: vi.fn(),
  nativeIngestionCleanupAdapter: {},
  registerInstallListener: vi.fn(),
  registerExtensionCommandListener: vi.fn(),
  registerAggregateEditorPresencePorts: vi.fn(),
  registerWindowBoundsListener: vi.fn(),
  registerVoiceInputPorts: vi.fn(),
  registerVoiceInputTelemetryPorts: vi.fn(),
  registerSecurityE2EControl: vi.fn(),
  initializeNativeAppPermissionLifecycle: vi.fn(),
  subscribeToLocaleChanges: vi.fn(() => vi.fn()),
}));
const syncWiring = vi.hoisted(() => ({
  createCoordinator:
    vi.fn<typeof import('../../../sync-connection/coordinator').createSyncConnectionCoordinator>(),
  createGateway:
    vi.fn<typeof import('../../../sync-connection/offscreen-gateway').createSyncOffscreenGateway>(),
  inspect: vi.fn().mockResolvedValue(null),
  start: vi.fn(),
  startWorkspace: vi.fn(),
  reserveErasure: vi.fn(),
  permissionsRemoved: vi.fn<(isAffected: (origin: string) => boolean) => Promise<void>>(),
  quiesce: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
  ensureDocument: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
  inspectExecutor: vi.fn().mockResolvedValue({ kind: 'absent' }),
  startExecutor: vi.fn(),
  startWorkspaceExecutor: vi.fn(),
  stopExecutor: vi.fn(),
  ensureOffscreen: vi.fn().mockResolvedValue(false),
  waitReady: vi.fn().mockResolvedValue(undefined),
  getContexts: vi.fn().mockResolvedValue([]),
  send: vi.fn().mockResolvedValue({ success: true }),
  loadConnection: vi.fn<() => Promise<SyncConnectionMetadata | null>>().mockResolvedValue(null),
  commandConnection: vi.fn().mockResolvedValue(undefined),
  loadWorkspace: vi.fn<() => Promise<SyncWorkspaceAllocation | null>>().mockResolvedValue(null),
  revokeWorkspace: vi.fn().mockResolvedValue(undefined),
  contains: vi.fn().mockResolvedValue(true),
  subscribeRemoved:
    vi.fn<(listener: (permissions: chrome.permissions.Permissions) => void) => () => void>(),
  warn: vi.fn(),
}));
vi.mock('../../../sync-connection/coordinator', () => ({
  createSyncConnectionCoordinator: syncWiring.createCoordinator,
}));
vi.mock('../../../sync-connection/offscreen-gateway', () => ({
  createSyncOffscreenGateway: syncWiring.createGateway,
}));
vi.mock('../../../offscreen-document/service', async (original) => ({
  ...(await original<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: syncWiring.ensureOffscreen,
  waitForOffscreenReady: syncWiring.waitReady,
}));
vi.mock('@sniptale/platform/browser/runtime', async (original) => {
  const actual = await original<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...actual,
    browserRuntime: { ...actual.browserRuntime, getContexts: syncWiring.getContexts },
  };
});
vi.mock('@sniptale/platform/browser/permissions', async (original) => {
  const actual = await original<typeof import('@sniptale/platform/browser/permissions')>();
  return {
    ...actual,
    browserPermissions: {
      ...actual.browserPermissions,
      contains: syncWiring.contains,
      subscribeToRemoved: syncWiring.subscribeRemoved,
    },
  };
});
vi.mock('../../../routing-contracts/runtime-messaging/services', async (original) => ({
  ...(await original<typeof import('../../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: syncWiring.send }),
}));
vi.mock('../../../../composition/persistence/remote-connection/store', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/remote-connection/store')
  >()),
  loadSyncConnection: syncWiring.loadConnection,
  commandSyncConnection: syncWiring.commandConnection,
}));
vi.mock(
  '../../../../composition/persistence/remote-connection/workspace-allocation',
  async (original) => ({
    ...(await original<
      typeof import('../../../../composition/persistence/remote-connection/workspace-allocation')
    >()),
    loadSyncWorkspaceAllocation: syncWiring.loadWorkspace,
    revokeSyncWorkspaceAllocation: syncWiring.revokeWorkspace,
  })
);
vi.mock('@sniptale/platform/observability/logger', async (original) => {
  const actual = await original<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: (options: Parameters<typeof actual.createLogger>[0]) => {
      const logger = actual.createLogger(options);
      return options.namespace === 'BackgroundRuntimeWiring'
        ? { ...logger, warn: syncWiring.warn }
        : logger;
    },
  };
});
vi.mock('../../../ai/llm/content-text-port', () => ({ registerContentTextPorts }));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  subscribeToLocaleChanges,
}));
vi.mock('../../native-app/permission-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../native-app/permission-lifecycle')>()),
  initializeNativeAppPermissionLifecycle,
}));
vi.mock('../../../../platform/security-e2e-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/security-e2e-control')>()),
  registerSecurityE2EControl,
}));
vi.mock('../../../application/aggregate-promotion/ports', () => ({
  registerAggregateEditorPresencePorts,
}));

vi.mock('../../../application/privacy-erasure/composition', () => ({
  configureNativeIngestionPrivacyErasureCleanupPort,
  configureScreenshotPrivacyErasureCleanupPort,
  eraseLocalExtensionDataFromBackground,
  configureAudioJobPrivacyErasurePort,
  configureSyncPrivacyErasurePort,
}));
vi.mock('../../native-app/privacy-erasure', () => ({
  nativeIngestionPrivacyErasureCleanupAdapter: nativeIngestionCleanupAdapter,
}));
vi.mock('../../../routing-contracts/download-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../routing-contracts/download-port')>()),
  configureDownloadPort,
}));
vi.mock('../../../capture/download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/download/download-router')>()),
  executeDownloadBlob,
}));
vi.mock('./install', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./install')>()),
  registerInstallListener,
}));
vi.mock('./window-bounds', () => ({ registerWindowBoundsListener }));
vi.mock('../../commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../commands')>()),
  registerExtensionCommandListener,
}));
vi.mock('../../../voice-input/coordinator', () => ({
  cleanupVoiceInputForPrivacyErasure: vi.fn(),
  createVoiceInputCoordinator: vi.fn(),
  handleVoiceInputOffscreenEvent: vi.fn(),
  registerVoiceInputPorts,
}));
vi.mock('../../../voice-input/telemetry-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../voice-input/telemetry-port')>()),
  registerVoiceInputTelemetryPorts,
}));

import {
  createModeState,
  initializeBackgroundContextMenus,
  nativeAppConnect,
  navigationListenerRef,
  registerWebSnapshotViewerPorts,
  removedListenerRef,
  updatedListenerRef,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { initializeBackgroundRuntime } from './initialize';

beforeEach(() => {
  syncWiring.createGateway.mockReturnValue({
    ensureDocument: syncWiring.ensureDocument,
    inspectExecutor: syncWiring.inspectExecutor,
    startExecutor: syncWiring.startExecutor,
    startWorkspaceExecutor: syncWiring.startWorkspaceExecutor,
    stopExecutor: syncWiring.stopExecutor,
  });
  syncWiring.createCoordinator.mockReturnValue({
    inspect: syncWiring.inspect,
    start: syncWiring.start,
    startWorkspace: syncWiring.startWorkspace,
    reserveErasure: syncWiring.reserveErasure,
    permissionsRemoved: syncWiring.permissionsRemoved,
  });
  syncWiring.inspect.mockResolvedValue(null);
  syncWiring.reserveErasure.mockReturnValue({
    quiesce: syncWiring.quiesce,
    release: syncWiring.release,
  });
  syncWiring.permissionsRemoved.mockResolvedValue(undefined);
  syncWiring.getContexts.mockResolvedValue([]);
  syncWiring.loadConnection.mockResolvedValue(null);
  syncWiring.loadWorkspace.mockResolvedValue(null);
  syncWiring.revokeWorkspace.mockResolvedValue(undefined);
  syncWiring.quiesce.mockResolvedValue(undefined);
  syncWiring.contains.mockResolvedValue(true);
  syncWiring.commandConnection.mockResolvedValue(undefined);
  syncWiring.subscribeRemoved.mockReturnValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('registers all background listeners through the runtime-wiring owner', () => {
  const state = createModeState();
  initializeNativeAppPermissionLifecycle.mockImplementation((service: { connect: () => void }) => {
    service.connect();
    return vi.fn();
  });

  initializeBackgroundRuntime(state);

  expect(removedListenerRef.current).toEqual(expect.any(Function));
  expect(updatedListenerRef.current).toEqual(expect.any(Function));
  expect(navigationListenerRef.current).toEqual(expect.any(Function));
  expect(configureNativeIngestionPrivacyErasureCleanupPort).toHaveBeenCalledWith(
    nativeIngestionCleanupAdapter
  );
  expect(configureScreenshotPrivacyErasureCleanupPort).toHaveBeenCalledWith({
    disableScreenshotMode: expect.any(Function),
  });
  expect(configureNativeIngestionPrivacyErasureCleanupPort).toHaveBeenCalledBefore(
    nativeAppConnect
  );
  expect(configureDownloadPort).toHaveBeenCalledWith({ executeDownloadBlob });
  expect(configureDownloadPort).toHaveBeenCalledBefore(registerInstallListener);
  expect(registerInstallListener).toHaveBeenCalledBefore(initializeBackgroundContextMenus);
  expect(registerContentTextPorts).toHaveBeenCalledOnce();
  const contentTextJobs = registerContentTextPorts.mock.calls[0]?.[0];
  expect(configureAudioJobPrivacyErasurePort).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Object),
    contentTextJobs
  );
  expect(registerWindowBoundsListener).toHaveBeenCalledOnce();
  expect(registerVoiceInputPorts).toHaveBeenCalledOnce();
  expect(registerVoiceInputTelemetryPorts).toHaveBeenCalledOnce();
  expect(registerAggregateEditorPresencePorts).toHaveBeenCalledOnce();
  expect(registerExtensionCommandListener).toHaveBeenCalledWith(state);
  expect(subscribeToLocaleChanges).toHaveBeenCalledOnce();
  expect(nativeAppConnect).toHaveBeenCalledTimes(1);
  expect(registerWebSnapshotViewerPorts).toHaveBeenCalledWith(state.webSnapshotViewerPorts);
  expect(initializeBackgroundContextMenus).toHaveBeenCalledWith({
    captureGuardState: state.captureGuardState,
    screenshotModeState: state.screenshotModeState,
    viewportOwnerState: state.viewportOwnerState,
    viewportState: state.viewportState,
  });
});

it('creates a disposable viewer port registry when runtime state omits it', () => {
  const state = createModeState();
  delete (state as Partial<typeof state>).webSnapshotViewerPorts;

  initializeBackgroundRuntime(state);

  expect(registerWebSnapshotViewerPorts).toHaveBeenCalledWith(expect.any(Map));
});

it('registers the security control only in the security E2E build', () => {
  Object.defineProperty(globalThis, '__SNIPTALE_SECURITY_E2E__', {
    configurable: true,
    value: true,
  });
  try {
    initializeBackgroundRuntime(createModeState());
    expect(registerSecurityE2EControl).toHaveBeenCalledOnce();
  } finally {
    Reflect.deleteProperty(globalThis, '__SNIPTALE_SECURITY_E2E__');
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function gatewayDependencies() {
  const deps = syncWiring.createGateway.mock.calls[0]?.[0];
  if (!deps) throw new Error('Missing composed sync gateway');
  return deps;
}
function coordinatorDependencies() {
  const deps = syncWiring.createCoordinator.mock.calls[0]?.[0];
  if (!deps) throw new Error('Missing composed sync coordinator');
  return deps;
}
function removedPermissionListener() {
  const listener = syncWiring.subscribeRemoved.mock.calls[0]?.[0];
  if (!listener) throw new Error('Missing permission removal listener');
  return listener;
}
function nativeConnection(): SyncConnectionMetadata {
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
      spaceId: 'space',
      connectionGeneration: 3,
      profileCreatedAt: 1,
    },
    identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 2 },
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
}

function nativeWorkspace(): SyncWorkspaceAllocation {
  return {
    version: 2,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl: 'https://dav.example.test/',
    rootUrl: 'https://dav.example.test/Sniptale-22222222-2222-4222-8222-222222222222/',
    accountId: 'alice',
    spaceId: '11111111-1111-4111-8111-111111111111',
    bootstrapId: '22222222-2222-4222-8222-222222222222',
    createdAt: 1,
    identity: { incarnation: '33333333-3333-4333-8333-333333333333', revision: 3 },
    phase: 'allocated',
    marker: null,
  };
}

it('exposes synchronous privacy reservation while startup adoption is still pending', async () => {
  const adoption = deferred<null>();
  syncWiring.inspect.mockReturnValueOnce(adoption.promise);
  initializeBackgroundRuntime(createModeState());
  expect(syncWiring.inspect).toHaveBeenCalledOnce();
  const port = configureSyncPrivacyErasurePort.mock.calls[0]?.[0];
  expect(port).toBeDefined();
  const reservation = port.reserveErasureExclusion();
  expect(syncWiring.reserveErasure).toHaveBeenCalledOnce();
  expect(reservation.quiesce).toBe(syncWiring.quiesce);
  await reservation.quiesce();
  reservation.release();
  expect(syncWiring.release).toHaveBeenCalledOnce();
  expect(syncWiring.start).not.toHaveBeenCalled();
  expect(registerSecurityE2EControl).not.toHaveBeenCalled();
  adoption.resolve(null);
});

it('preserves document discovery failure and missing identity instead of inventing an absent executor', async () => {
  initializeBackgroundRuntime(createModeState());
  const deps = gatewayDependencies();
  syncWiring.getContexts.mockRejectedValueOnce(new Error('Browser context query unavailable'));
  await expect(deps.getDocumentUrls()).rejects.toThrow('Browser context query unavailable');
  syncWiring.getContexts.mockResolvedValueOnce([{}]);
  await expect(deps.getDocumentUrls()).rejects.toThrow('Sync document identity unavailable');
  const documentUrl =
    'chrome-extension://test/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=live';
  syncWiring.getContexts.mockResolvedValueOnce([{ documentUrl }]);
  expect(await deps.getDocumentUrls()).toEqual([documentUrl]);
  expect(syncWiring.getContexts).toHaveBeenLastCalledWith({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  syncWiring.getContexts.mockResolvedValueOnce([]);
  expect(await deps.getDocumentUrls()).toEqual([]);
});

it('uses the existing document service and runtime transport without starting a page-owned client', async () => {
  initializeBackgroundRuntime(createModeState());
  const deps = gatewayDependencies();
  await deps.ensureDocument();
  expect(syncWiring.ensureOffscreen).toHaveBeenCalledWith('Transfer user-selected sync files');
  await deps.waitForReady();
  expect(syncWiring.waitReady).toHaveBeenCalledOnce();
  const requestId = deps.createRequestId();
  const challenge = coordinatorDependencies().createChallenge();
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(challenge).toMatch(/^[0-9a-f-]{36}$/u);
  expect(challenge).not.toBe(requestId);
  const message: Parameters<typeof deps.send>[0] = {
    type: MessageType.OFFSCREEN_SYNC_INSPECT,
    requestId,
    challenge,
    offscreenStartupId: '11111111-1111-4111-8111-111111111111',
    capabilityToken: 'test-capability',
  };
  syncWiring.send.mockResolvedValueOnce({ success: true, challenge });
  expect(await deps.send(message)).toEqual({ success: true, challenge });
  expect(syncWiring.send).toHaveBeenCalledWith(message);
  expect(syncWiring.start).not.toHaveBeenCalled();
});

it('awaits durable native pause before exposing revocation completion and propagates refusal', async () => {
  initializeBackgroundRuntime(createModeState());
  const deps = coordinatorDependencies();
  const commit = deferred<void>();
  syncWiring.commandConnection.mockReturnValueOnce(commit.promise);
  let completed = false;
  const revocation = deps.revokeConnection(nativeConnection().identity).then(() => {
    completed = true;
  });
  expect(syncWiring.commandConnection).toHaveBeenCalledExactlyOnceWith(
    nativeConnection().identity,
    'pause'
  );
  await Promise.resolve();
  expect(completed).toBe(false);
  commit.resolve();
  await revocation;
  expect(completed).toBe(true);
  syncWiring.commandConnection.mockRejectedValueOnce(new Error('Native pause refused'));
  await expect(deps.revokeConnection(nativeConnection().identity)).rejects.toThrow(
    'Native pause refused'
  );
});

it('permission removal checks the retained origin and revokes only that origin after a missing grant', async () => {
  initializeBackgroundRuntime(createModeState());
  syncWiring.loadConnection.mockResolvedValue(nativeConnection());
  const checked = deferred<void>();
  const permission = deferred<boolean>();
  syncWiring.contains.mockImplementationOnce(async () => {
    checked.resolve();
    return permission.promise;
  });
  const revoked = deferred<void>();
  syncWiring.permissionsRemoved.mockImplementationOnce(async (isAffected) => {
    expect(isAffected('https://dav.example.test')).toBe(true);
    expect(isAffected('https://other.example.test')).toBe(false);
    expect(isAffected('https://dav.example.test.evil')).toBe(false);
    revoked.resolve();
  });
  removedPermissionListener()({ origins: ['https://unrelated.example.test/*'] });
  await checked.promise;
  expect(syncWiring.contains).toHaveBeenCalledWith({ origins: ['https://dav.example.test/*'] });
  expect(syncWiring.permissionsRemoved).not.toHaveBeenCalled();
  permission.resolve(false);
  await revoked.promise;
  expect(syncWiring.permissionsRemoved).toHaveBeenCalledOnce();
});

it('permission removal preserves an unaffected grant without reading workspace authority', async () => {
  initializeBackgroundRuntime(createModeState());
  const checked = deferred<void>();
  syncWiring.loadConnection.mockResolvedValueOnce(nativeConnection());
  syncWiring.contains.mockImplementationOnce(async () => {
    checked.resolve();
    return true;
  });
  removedPermissionListener()({ origins: ['https://unrelated.example.test/*'] });
  await checked.promise;
  await Promise.resolve();
  expect(syncWiring.permissionsRemoved).not.toHaveBeenCalled();
  expect(syncWiring.contains).toHaveBeenCalledOnce();
  expect(syncWiring.loadWorkspace).not.toHaveBeenCalled();
  expect(syncWiring.start).not.toHaveBeenCalled();
});

it.each(['load', 'permission', 'revocation'] as const)(
  'keeps %s failure in permission lifecycle local and logs a fixed diagnostic',
  async (stage) => {
    initializeBackgroundRuntime(createModeState());
    syncWiring.loadConnection.mockResolvedValue(nativeConnection());
    const privateFailure = new Error('Synthetic private root and credential');
    if (stage === 'load') syncWiring.loadConnection.mockRejectedValueOnce(privateFailure);
    if (stage === 'permission') syncWiring.contains.mockRejectedValueOnce(privateFailure);
    if (stage === 'revocation') {
      syncWiring.contains.mockResolvedValueOnce(false);
      syncWiring.permissionsRemoved.mockRejectedValueOnce(privateFailure);
    }
    const logged = deferred<void>();
    syncWiring.warn.mockImplementation((message: string) => {
      if (message === 'Sync permission revocation failed') logged.resolve();
    });
    removedPermissionListener()({ origins: ['https://dav.example.test/*'] });
    await logged.promise;
    expect(syncWiring.warn).toHaveBeenCalledExactlyOnceWith('Sync permission revocation failed');
  }
);

it('isolates failed startup adoption without starting another producer', async () => {
  syncWiring.inspect.mockRejectedValueOnce(new Error('Synthetic private executor failure'));
  const logged = deferred<void>();
  syncWiring.warn.mockImplementation((message: string) => {
    if (message === 'Sync executor adoption refused') logged.resolve();
  });
  initializeBackgroundRuntime(createModeState());
  await logged.promise;
  expect(syncWiring.warn).toHaveBeenCalledExactlyOnceWith('Sync executor adoption refused');
  expect(syncWiring.start).not.toHaveBeenCalled();
});

it.each([true, false])(
  'security-only erasure reports actual privacy result %s with complete owner options',
  async (success) => {
    vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
    const state = createModeState();
    initializeBackgroundRuntime(state);
    const control = registerSecurityE2EControl.mock.calls[0]?.[0];
    expect(control).toBeDefined();
    const erased = deferred<{ success: boolean }>();
    eraseLocalExtensionDataFromBackground.mockReturnValueOnce(erased.promise);
    const completion = control.erase();
    expect(eraseLocalExtensionDataFromBackground).toHaveBeenCalledExactlyOnceWith(
      {
        type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
        includeAiProviderSecrets: true,
        preservePreferences: false,
      },
      state
    );
    erased.resolve({ success });
    expect(await completion).toBe(success);
  }
);

it('injects native workspace authority and the shared gateway into the same coordinator', async () => {
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  initializeBackgroundRuntime(createModeState());
  const deps = coordinatorDependencies();
  expect(deps.loadWorkspace).toBe(syncWiring.loadWorkspace);
  expect(deps.startWorkspaceExecutor).toBe(syncWiring.startWorkspaceExecutor);
  const allocation = nativeWorkspace();
  const committed = deferred<void>();
  syncWiring.revokeWorkspace.mockReturnValueOnce(committed.promise);
  let settled = false;
  const revocation = deps.revokeWorkspace(allocation.identity.incarnation).then(() => {
    settled = true;
  });
  expect(syncWiring.revokeWorkspace).toHaveBeenCalledExactlyOnceWith(
    allocation.identity.incarnation
  );
  await Promise.resolve();
  expect(settled).toBe(false);
  committed.resolve();
  await revocation;
  expect(settled).toBe(true);
  syncWiring.revokeWorkspace.mockRejectedValueOnce(new Error('Native lifetime refusal'));
  await expect(deps.revokeWorkspace(allocation.identity.incarnation)).rejects.toThrow(
    'Native lifetime refusal'
  );
  const control = registerSecurityE2EControl.mock.calls[0]?.[0];
  expect(control.startWorkspace).toBe(syncWiring.startWorkspace);
});

it('revokes a pre-enrollment workspace when its current origin grant is removed', async () => {
  initializeBackgroundRuntime(createModeState());
  syncWiring.loadWorkspace.mockResolvedValue(nativeWorkspace());
  syncWiring.contains.mockResolvedValueOnce(false);
  const revoked = deferred<void>();
  syncWiring.permissionsRemoved.mockImplementationOnce(async (isAffected) => {
    expect(isAffected('https://dav.example.test')).toBe(true);
    expect(isAffected('https://unrelated.example.test')).toBe(false);
    revoked.resolve();
  });
  removedPermissionListener()({ origins: ['https://dav.example.test/*'] });
  await revoked.promise;
  expect(syncWiring.contains).toHaveBeenCalledExactlyOnceWith({
    origins: ['https://dav.example.test/*'],
  });
  expect(syncWiring.permissionsRemoved).toHaveBeenCalledOnce();
  expect(syncWiring.startWorkspace).not.toHaveBeenCalled();
});

it('contains a surviving executor after permission removal with missing native authority', async () => {
  initializeBackgroundRuntime(createModeState());
  const contained = deferred<void>();
  syncWiring.permissionsRemoved.mockImplementationOnce(async (isAffected) => {
    expect(isAffected('https://dav.example.test')).toBe(true);
    expect(isAffected('https://other.example.test')).toBe(true);
    contained.resolve();
  });
  removedPermissionListener()({ origins: ['https://dav.example.test/*'] });
  await contained.promise;
  expect(syncWiring.contains).not.toHaveBeenCalled();
  expect(syncWiring.startWorkspace).not.toHaveBeenCalled();
});

it.each(['connection', 'workspace', 'permission'] as const)(
  'contains uncertain authority after %s read failure and waits for drain before release',
  async (failure) => {
    initializeBackgroundRuntime(createModeState());
    if (failure === 'connection')
      syncWiring.loadConnection.mockRejectedValueOnce(new Error('private-native-error'));
    else if (failure === 'workspace')
      syncWiring.loadWorkspace.mockRejectedValueOnce(new Error('private-native-error'));
    else {
      syncWiring.loadWorkspace.mockResolvedValueOnce(nativeWorkspace());
      syncWiring.contains.mockRejectedValueOnce(new Error('private-permission-error'));
    }
    const entered = deferred<void>();
    const drained = deferred<void>();
    syncWiring.quiesce.mockImplementationOnce(async () => {
      entered.resolve();
      await drained.promise;
    });
    const logged = deferred<void>();
    syncWiring.warn.mockImplementationOnce((message: string) => {
      expect(message).toBe('Sync permission revocation failed');
      logged.resolve();
    });
    removedPermissionListener()({ origins: ['https://dav.example.test/*'] });
    await entered.promise;
    expect(syncWiring.reserveErasure).toHaveBeenCalledOnce();
    expect(syncWiring.release).not.toHaveBeenCalled();
    drained.resolve();
    await logged.promise;
    expect(syncWiring.release).toHaveBeenCalledOnce();
    expect(syncWiring.permissionsRemoved).not.toHaveBeenCalled();
    expect(syncWiring.startWorkspace).not.toHaveBeenCalled();
  }
);

it('releases failed containment and reports only the fixed permission diagnostic', async () => {
  initializeBackgroundRuntime(createModeState());
  syncWiring.loadWorkspace.mockRejectedValueOnce(new Error('private-native-error'));
  syncWiring.quiesce.mockRejectedValueOnce(new Error('private-drain-error'));
  const logged = deferred<void>();
  syncWiring.warn.mockImplementationOnce((message: string) => {
    expect(message).toBe('Sync permission revocation failed');
    logged.resolve();
  });
  removedPermissionListener()({ origins: ['https://dav.example.test/*'] });
  await logged.promise;
  expect(syncWiring.release).toHaveBeenCalledOnce();
  expect(syncWiring.permissionsRemoved).not.toHaveBeenCalled();
});
