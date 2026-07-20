import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeAppInboundMessage } from '../../../contracts/native-app';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createNativeHello, createNativeLease } from './service.test-support';

const mocks = vi.hoisted(() => ({
  getManifest: vi.fn(),
  getStatus: vi.fn(),
  loadVideoSettings: vi.fn(),
  reconnect: vi.fn(),
  syncSettings: vi.fn(),
  takeController: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: mocks.getManifest,
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettings,
}));

vi.mock('./service-singleton', () => ({
  getNativeAppRuntimeService: () => ({
    getStatus: mocks.getStatus,
    reconnect: mocks.reconnect,
    syncSettings: mocks.syncSettings,
    takeController: mocks.takeController,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getManifest.mockReturnValue({
    name: 'Sniptale',
    version: '0.1.0',
    version_name: '0.1.0',
  });
  mocks.getStatus.mockResolvedValue(createStatus());
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
});

function createStatus(patch: Partial<NativeAppRuntimeStatus> = {}): NativeAppRuntimeStatus {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'connected',
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: null,
    lastHeartbeatAt: null,
    lastOperationError: null,
    platform: null,
    settingsRevision: null,
    trayActions: null,
    warnings: [],
    ...patch,
  };
}

it('resolves native host names from manifest channel hints', async () => {
  const { resolveNativeHostName } = await import('./host');

  expect(resolveNativeHostName('stable')).toBe('com.sniptale.native_host');
  expect(resolveNativeHostName('beta')).toBe('com.sniptale.beta.native_host');
  expect(resolveNativeHostName('dev')).toBe('com.sniptale.dev.native_host');

  mocks.getManifest.mockReturnValue({ name: 'Sniptale Beta', version: '0.1.0' });
  expect(resolveNativeHostName()).toBe('com.sniptale.beta.native_host');

  mocks.getManifest.mockReturnValue({ name: 'Sniptale local', version_name: '0.1.0-dev' });
  expect(resolveNativeHostName()).toBe('com.sniptale.dev.native_host');
});

it('maps native startup, disconnect, and command ids', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(36);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const { applyNativeDisconnectError, applyNativeStartupError } = await import('./errors');
  const { createNativeCommandId, createNativeConnectionId } = await import('./ids');

  expect(applyNativeDisconnectError(createStatus(), undefined).error).toBeNull();
  expect(applyNativeDisconnectError(createStatus(), { message: 'lost' }).error).toEqual(
    expect.objectContaining({ message: 'lost', recoverable: true })
  );
  expect(applyNativeStartupError(createStatus(), 'boom').error).toEqual(
    expect.objectContaining({ message: 'Native app unavailable' })
  );
  expect(applyNativeStartupError(createStatus(), new Error('native failed')).error).toEqual(
    expect.objectContaining({ message: 'native failed' })
  );
  expect(applyNativeDisconnectError(createStatus(), {}).error).toEqual(
    expect.objectContaining({ recoverable: true })
  );
  expect(createNativeConnectionId()).toMatch(/^conn-10-/);
  expect(createNativeCommandId('ping')).toMatch(/^ping-10-/);
});

it('routes native settings queries and mutations through the runtime service', async () => {
  const sendResponse = vi.fn();
  const { routeNativeAppRuntimeMessage } = await import('./route');

  expect(
    routeNativeAppRuntimeMessage({ type: MessageType.NATIVE_APP_QUERY }, {}, sendResponse)
  ).toBe(true);
  await flushAsync();
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      status: expect.objectContaining({ connectionState: 'connected' }),
      success: true,
    })
  );
  expect(mocks.getStatus).toHaveBeenCalledTimes(1);

  expect(
    routeNativeAppRuntimeMessage(
      { operation: 'reconnect', type: MessageType.NATIVE_APP_MUTATION },
      {},
      sendResponse
    )
  ).toBe(true);
  expect(mocks.reconnect).toHaveBeenCalledTimes(1);

  routeNativeAppRuntimeMessage(
    { operation: 'take-controller', type: MessageType.NATIVE_APP_MUTATION },
    {},
    sendResponse
  );
  routeNativeAppRuntimeMessage(
    { operation: 'sync-settings', type: MessageType.NATIVE_APP_MUTATION },
    {},
    sendResponse
  );
  expect(mocks.takeController).toHaveBeenCalledTimes(1);
  expect(mocks.syncSettings).toHaveBeenCalledTimes(1);
  expect(routeNativeAppRuntimeMessage({ type: 'other' }, {}, sendResponse)).toBe(false);
});

it('applies compatibility and native hello authority transitions', async () => {
  const { resolveNativeHandshakeFailure } = await import('./compatibility');
  const { applyNativeHelloStatus } = await import('./status-updates');
  const { applyNativeHelloAuthority } = await import('./service-hello');

  expect(resolveNativeHandshakeFailure(createNativeHello())).toBeNull();
  expect(
    resolveNativeHandshakeFailure(createNativeHello({ supportedProtocolVersions: [99] }))
  ).toBe('incompatible-protocol');
  expect(resolveNativeHandshakeFailure(createNativeHello({ minExtensionVersion: '99.0.0' }))).toBe(
    'extension-upgrade-required'
  );
  expect(applyNativeHelloStatus(createStatus(), createNativeHello()).shouldAcquireController).toBe(
    true
  );
  expect(
    applyNativeHelloAuthority({
      message: createNativeHello({ supportedProtocolVersions: [99] }),
      pendingReason: null,
      status: createStatus(),
    }).status
  ).toEqual(
    expect.objectContaining({ capabilities: null, connectionState: 'incompatible-protocol' })
  );
});

it('applies native runtime status transitions', async () => {
  const {
    applyNativeLeaseStatus,
    applyNativeOperationFailedStatus,
    clearNativeAuthorityStatus,
    clearNativeControllerStatus,
  } = await import('./status-updates');

  expect(applyNativeLeaseStatus(createStatus(), createNativeLease()).controllerLease).toEqual(
    expect.objectContaining({ controllerLeaseId: 'lease-1' })
  );
  expect(clearNativeAuthorityStatus(createStatus(), 'missing-host').connectionState).toBe(
    'missing-host'
  );
  expect(
    clearNativeAuthorityStatus(
      createStatus({ capabilities: createNativeHello().capabilities }),
      'missing-host'
    ).capabilities
  ).toBeNull();
  expect(
    clearNativeControllerStatus(createStatus({ controllerLease: createNativeLease() }))
  ).toEqual(expect.objectContaining({ controllerLease: null }));
  expect(
    clearNativeControllerStatus(createStatus({ capabilities: createNativeHello().capabilities }))
      .capabilities
  ).toBeNull();
  expect(applyNativeOperationFailedStatus(createStatus(), createPolicyDeniedMessage())).toEqual(
    expect.objectContaining({ connectionState: 'policy-denied' })
  );
});

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createPolicyDeniedMessage(): Extract<
  NativeAppInboundMessage,
  { type: 'app.operation.failed' }
> {
  return {
    controllerLeaseId: 'lease-1',
    error: { code: 'policy-denied', recoverable: false },
    occurredAtEpochMs: 1,
    operation: 'screenshot',
    phase: 'capture',
    protocolVersion: 1,
    type: 'app.operation.failed',
  };
}
