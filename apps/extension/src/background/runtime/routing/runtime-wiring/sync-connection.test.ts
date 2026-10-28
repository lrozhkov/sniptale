import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../../../composition/persistence/remote-connection/model';
import type { SyncQueueRetryWakeupDependencies } from '../../../sync-connection/retry-wakeup';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { initializeSyncConnectionRuntime } from './sync-connection';

const ports = vi.hoisted(() => ({
  loadConnection: vi.fn<() => Promise<SyncConnectionMetadata | null>>(),
  inspect: vi.fn<() => Promise<unknown>>(),
  productCommand: vi.fn(),
  createCoordinator: vi.fn(),
  createGateway: vi.fn(),
  configureProductRoute:
    vi.fn<typeof import('../../../sync-connection/product-route').configureSyncProductRoute>(),
  createRetry: vi.fn<(deps: SyncQueueRetryWakeupDependencies) => unknown>(),
  runRetry: vi.fn<() => Promise<void>>(),
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
  enrollSyncWorkspaceConnection: vi.fn(),
  commandSyncConnection: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-allocation', () => ({
  createSyncWorkspaceAllocation: vi.fn(),
  loadSyncWorkspaceAllocation: vi.fn(),
  revokeSyncWorkspaceAllocation: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-join', () => ({
  createSyncWorkspaceJoin: vi.fn(),
  revokeSyncWorkspaceJoin: vi.fn(),
}));
vi.mock('../../../../composition/persistence/remote-connection/workspace-selection', () => ({
  loadSyncWorkspaceSelection: vi.fn(),
}));
vi.mock('../../../../composition/persistence/sync-capture/queue-schedule', () => ({
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
}));
vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { contains: vi.fn(), subscribeToRemoved: vi.fn() },
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
  eraseLocalExtensionDataFromBackground: vi.fn(),
}));
vi.mock('../../../../platform/security-e2e-control', () => ({
  registerSecurityE2EControl: vi.fn(),
}));
vi.mock('../../../../platform/runtime-messaging/sync-product-client', () => ({
  subscribeToSyncQueueSettled: vi.fn(),
}));
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
  ports.inspect.mockResolvedValue(null);
  ports.createGateway.mockReturnValue({});
  ports.createCoordinator.mockReturnValue({
    inspect: ports.inspect,
    productCommand: ports.productCommand,
  });
  ports.createRetry.mockReturnValue({ run: ports.runRetry, dispose: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it('admits automatic incoming only for an active workspace and wakes enrollment', async () => {
  initializeSyncConnectionRuntime(createBackgroundRuntimeState());
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
