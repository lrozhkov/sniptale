import type { NativeIngestionOutboundMessage } from '../../capture/native-app/ingestion-types';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeAppRuntimeService } from './service';
import {
  createNativeHello,
  createNativeLease,
  createNativeTestPort,
  installChromeRuntimeInfo,
  waitForNativePost,
} from './service.test-support';
import { createNativeStorage } from './service-storage.test-support';
import { buildBrowserStorageErasurePlan } from '../../../composition/persistence/privacy-erasure/inventory';
import { createBrowserStorageParticipant } from '../../../composition/persistence/privacy-erasure/browser-storage-participant';
import { nativeSettingsFixture } from '../../../contracts/native-app/settings.test-support';

const mocks = vi.hoisted(() => ({
  resume: vi.fn(async () => []),
  ingest: vi.fn<(...args: unknown[]) => Promise<NativeIngestionOutboundMessage[]>>(async () => []),
}));
vi.mock('../../capture/native-app/persistence/staging', async (original) => ({
  ...(await original<typeof import('../../capture/native-app/persistence/staging')>()),
  cleanupStaleNativeTransferSessions: vi.fn(async () => []),
}));
vi.mock('../../capture/native-app/controller', () => ({
  createNativeAppIngestionController: () => ({
    resumePendingTransfers: mocks.resume,
    resumePendingHistoryTransfers: vi.fn(async () => []),
    handleScreenshotStart: mocks.ingest,
  }),
}));

const services: ReturnType<typeof createNativeAppRuntimeService>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  installChromeRuntimeInfo();
});
afterEach(() => {
  services.forEach((service) => service.disconnectForPermissionRevocation());
  services.length = 0;
  vi.useRealTimers();
});

function setup(storage = createNativeStorage({}, false)) {
  const port = createNativeTestPort();
  const connectNative = vi.fn(() => port);
  const service = createNativeAppRuntimeService({ connectNative, storage });
  services.push(service);
  service.connect();
  return { port, service, storage, connectNative };
}
async function hello(ctx: ReturnType<typeof setup>, message = createNativeHello()) {
  ctx.port.emitMessage(message);
  // Drain the storage adapter and service continuations without scheduling a timer.
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}
async function selected(ctx: ReturnType<typeof setup>) {
  await hello(ctx);
  await waitForNativePost(ctx.port, 'extension.controller.acquire');
  const request = ctx.port.postMessage.mock.calls
    .map(([message]) => message)
    .find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'extension.controller.acquire'
    );
  if (
    typeof request !== 'object' ||
    request === null ||
    !('connectionId' in request) ||
    typeof request.connectionId !== 'string'
  )
    throw new Error('Missing connection identity');
  ctx.port.emitMessage(
    createNativeLease({
      controller: {
        extensionId: 'extension-id',
        browserFamily: 'chrome',
        profileKey: 'profile:test',
        connectionId: request.connectionId,
      },
    })
  );
}

it('requires explicit trust before registration or media authority', async () => {
  const ctx = setup();
  await hello(ctx);
  expect((await ctx.service.getStatus()).connectionState).toBe('trust-required');
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
  ctx.port.emitMessage(createNativeLease());
  expect((await ctx.service.getStatus()).controllerLease).toBeNull();
  expect(mocks.resume).not.toHaveBeenCalled();
  await ctx.service.trustClient('a'.repeat(64));
  await waitForNativePost(ctx.port, 'extension.controller.acquire');
  expect(ctx.storage.local.set).toHaveBeenCalledWith(
    expect.objectContaining({
      'sniptale.nativeApp.trustedClient': expect.objectContaining({ clientId: 'a'.repeat(64) }),
    }),
    expect.anything()
  );
});

it('restores installation trust after runtime restart without another confirmation', async () => {
  const first = setup();
  await hello(first);
  await first.service.trustClient('a'.repeat(64));
  first.service.disconnectForPermissionRevocation();
  const restarted = setup(first.storage);
  await hello(restarted, createNativeHello({ appInstanceId: 'new-runtime-instance' }));
  await waitForNativePost(restarted.port, 'extension.controller.acquire');
  expect((await restarted.service.getStatus()).connectionState).toBe('connected');
});

it('requires new consent for a changed installation and rejects a stale consent action', async () => {
  const ctx = setup(createNativeStorage());
  await hello(
    ctx,
    createNativeHello({ appIdentity: { clientId: 'b'.repeat(64), trustVersion: 1 } })
  );
  await expect(ctx.service.trustClient('a'.repeat(64))).rejects.toThrow('identity changed');
  expect((await ctx.service.getStatus()).connectionState).toBe('trust-required');
  expect(ctx.storage.local.set).not.toHaveBeenCalled();
});

it('forgets the installation pin and requires confirmation after reconnect', async () => {
  const ctx = setup(createNativeStorage());
  await hello(ctx);
  await ctx.service.forgetClient();
  const restarted = setup(ctx.storage);
  await hello(restarted);
  expect((await restarted.service.getStatus()).connectionState).toBe('trust-required');
});

it('fails closed after a trust read failure', async () => {
  const storage = createNativeStorage();
  storage.local.get.mockRejectedValue(new Error('storage unavailable'));
  const ctx = setup(storage);
  await hello(ctx);
  expect((await ctx.service.getStatus()).connectionState).toBe('error');
  expect(ctx.port.disconnect).toHaveBeenCalledOnce();
});

it('preserves the consent state and permits retry after a trust write failure', async () => {
  const ctx = setup();
  await hello(ctx);
  ctx.storage.local.set.mockRejectedValueOnce(new Error('write refused'));
  await expect(ctx.service.trustClient('a'.repeat(64))).rejects.toThrow('write refused');
  expect((await ctx.service.getStatus()).controllerLease).toBeNull();
  await ctx.service.trustClient('a'.repeat(64));
  await waitForNativePost(ctx.port, 'extension.controller.acquire');
});

it('accepts Desktop settings only on the selected lease and never pushes extension settings', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  const warnings = [
    {
      code: 'deferred-evaluation',
      field: 'video.effectiveQuality',
      message: 'recording quality evaluation is deferred until source geometry is known',
    },
  ];
  const snapshot = {
    type: 'app.settings.accepted',
    protocolVersion: 2,
    controllerLeaseId: 'lease-1',
    revision: 'desktop-revision',
    schemaVersion: 1,
    acceptedAtEpochMs: Date.now(),
    effectiveSettings: {
      screenshots: nativeSettingsFixture.screenshots,
      video: nativeSettingsFixture.video,
      warnings,
    },
    warnings,
  };
  ctx.port.emitMessage(snapshot);
  expect(await ctx.service.getStatus()).toMatchObject({
    connectionState: 'connected',
    settingsRevision: 'desktop-revision',
    warnings,
    effectiveSettings: { warnings },
  });
  expect(ctx.port.disconnect).not.toHaveBeenCalled();
  ctx.port.emitMessage({ ...snapshot, controllerLeaseId: 'stale', revision: 'stale-revision' });
  expect((await ctx.service.getStatus()).settingsRevision).toBe('desktop-revision');
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.settings.sync' })
  );
});

it('revokes ingestion authority when Desktop selects another browser', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  const lease = (await ctx.service.getStatus()).controllerLease;
  if (!lease) throw new Error('Missing selected lease');
  ctx.port.emitMessage({ ...lease, status: 'rejected', selectionStatus: 'available' });
  expect((await ctx.service.getStatus()).connectionState).toBe('controlled-by-other-profile');
  expect(mocks.resume).toHaveBeenCalledTimes(1);
});

it('rejects v1 and malformed installation identity without registering a target', async () => {
  for (const patch of [
    { protocolVersion: 1 },
    { settingsAuthority: 'extension' },
    { appIdentity: { clientId: '../untrusted', trustVersion: 1 } },
  ]) {
    const ctx = setup(createNativeStorage());
    ctx.port.emitMessage({ ...createNativeHello(), ...patch });
    expect((await ctx.service.getStatus()).connectionState).toBe(
      'protocolVersion' in patch ? 'incompatible-protocol' : 'error'
    );
    expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extension.controller.acquire' })
    );
  }
});

function screenshot() {
  return {
    type: 'app.screenshot.start',
    protocolVersion: 2,
    controllerLeaseId: 'lease-1',
    captureId: 'capture-1',
    mode: 'screen',
    filename: 'capture.png',
    mimeType: 'image/png',
    totalBytes: 1,
    width: 1,
    height: 1,
    chunkCount: 1,
    sha256: 'a'.repeat(64),
    openEditor: false,
    capturedAtEpochMs: Date.now(),
  };
}

it('does not post a delayed transfer response to a new connection', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  let finish!: (responses: NativeIngestionOutboundMessage[]) => void;
  mocks.ingest.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  ctx.port.emitMessage(screenshot());
  expect(mocks.ingest).toHaveBeenCalledOnce();
  const nextPort = createNativeTestPort();
  ctx.connectNative.mockReturnValue(nextPort);
  await ctx.service.reconnect();
  await selected({ ...ctx, port: nextPort });
  finish([
    {
      type: 'extension.screenshot.ack',
      protocolVersion: 2,
      controllerLeaseId: 'lease-1',
      captureId: 'capture-1',
      assetId: 'capture-1',
      receipt: { durable: true, sha256: 'a'.repeat(64), totalBytes: 1 },
    },
  ]);
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  expect(nextPort.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.screenshot.ack' })
  );
});

it('refuses ingestion after the selected lease expires', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 60_001);
  ctx.port.emitMessage(screenshot());
  expect(mocks.ingest).not.toHaveBeenCalled();
});

it('ignores a delayed trust read from a disconnected port', async () => {
  const storage = createNativeStorage();
  const values = await storage.local.get();
  let finish!: (values: Record<string, unknown>) => void;
  storage.local.get.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const ctx = setup(storage);
  await hello(ctx);
  const nextPort = createNativeTestPort();
  ctx.connectNative.mockReturnValue(nextPort);
  await ctx.service.reconnect();
  await hello({ ...ctx, port: nextPort });
  await waitForNativePost(nextPort, 'extension.controller.acquire');
  finish(values);
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
});

it('reconnects after an unexpected Desktop exit with automatic intent', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  vi.useFakeTimers();
  const nextPort = createNativeTestPort();
  ctx.connectNative.mockReturnValue(nextPort);
  ctx.port.emitDisconnect();
  expect((await ctx.service.getStatus()).connectionState).toBe('reconnecting');
  await vi.advanceTimersByTimeAsync(1000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(2);
  expect(nextPort.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello', connectionIntent: 'automatic' })
  );
});

it('stops automatic reconnect after the bounded attempt budget', async () => {
  const ctx = setup(createNativeStorage());
  vi.useFakeTimers();
  let current = ctx.port;
  ctx.connectNative.mockImplementation(() => {
    current = createNativeTestPort();
    return current;
  });
  current.emitDisconnect();
  for (const delay of [1000, 2000, 5000, 10_000, 30_000]) {
    await vi.advanceTimersByTimeAsync(delay);
    current.emitDisconnect();
  }
  expect(ctx.connectNative).toHaveBeenCalledTimes(6);
  expect(await ctx.service.getStatus()).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({ message: 'Native app reconnect attempts exhausted' }),
    })
  );
  await vi.advanceTimersByTimeAsync(120_000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(6);
});

it('preserves deliberate Quit across MV3 restart and resumes only after an explicit connection action', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  vi.useFakeTimers();
  ctx.port.emitMessage({ type: 'app.connection.closed', protocolVersion: 2, reason: 'user-quit' });
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  ctx.port.emitDisconnect();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(1);
  const restarted = createNativeAppRuntimeService({
    storage: ctx.storage,
    connectNative: ctx.connectNative,
  });
  services.push(restarted);
  expect(await restarted.canAutoConnect()).toBe(false);
  await restarted.reconnect();
  expect(await restarted.canAutoConnect()).toBe(true);
  expect(ctx.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.hello', connectionIntent: 'user-requested' })
  );
});

it('processes a trusted Quit delivered before the installation pin read completes', async () => {
  const ctx = setup(createNativeStorage());
  ctx.port.emitMessage(createNativeHello());
  ctx.port.emitMessage({ type: 'app.connection.closed', protocolVersion: 2, reason: 'user-quit' });
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
  expect(await ctx.service.canAutoConnect()).toBe(false);
});

it('bounds registration after trust while allowing an explicit destination decision', async () => {
  const ctx = setup(createNativeStorage());
  vi.useFakeTimers();
  await hello(ctx);
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await ctx.service.getStatus()).connectionState).toBe('error');
  expect(ctx.port.disconnect).toHaveBeenCalledOnce();
});

it('recovers when a heartbeat races a disconnected native port', async () => {
  vi.useFakeTimers();
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  ctx.port.postMessage.mockImplementation(() => {
    throw new Error('Disconnected native port');
  });
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await ctx.service.getStatus()).connectionState).toBe('reconnecting');
});

it('preserves trusted Quit when the bridge closes before the pin read resolves', async () => {
  vi.useFakeTimers();
  const storage = createNativeStorage();
  const read = storage.local.get;
  const originalRead = read.getMockImplementation()!;
  let resolveRead!: (values: Record<string, unknown>) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      })
  );
  const ctx = setup(storage);
  ctx.port.emitMessage(createNativeHello());
  ctx.port.emitMessage({ type: 'app.connection.closed', protocolVersion: 2, reason: 'user-quit' });
  ctx.port.emitDisconnect();
  await vi.advanceTimersByTimeAsync(2000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(1);
  resolveRead(await originalRead('sniptale.nativeApp.trustedClient'));
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  expect(await ctx.service.canAutoConnect()).toBe(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(1);
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
});

it('does not let a delayed Quit decision override a newer explicit reconnect', async () => {
  const storage = createNativeStorage();
  const originalRead = storage.local.get.getMockImplementation()!;
  let resolveRead!: (values: Record<string, unknown>) => void;
  storage.local.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      })
  );
  const ctx = setup(storage);
  ctx.port.emitMessage(createNativeHello());
  ctx.port.emitMessage({ type: 'app.connection.closed', protocolVersion: 2, reason: 'user-quit' });
  ctx.port.emitDisconnect();
  await ctx.service.reconnect();
  resolveRead(await originalRead('sniptale.nativeApp.trustedClient'));
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  expect(await ctx.service.canAutoConnect()).toBe(true);
  expect(ctx.connectNative).toHaveBeenCalledTimes(2);
});

it('requires fresh consent after native trust is removed by privacy participants', async () => {
  const ctx = setup(createNativeStorage());
  await selected(ctx);
  ctx.service.quiesceForPrivacyErasure();
  const plan = buildBrowserStorageErasurePlan({
    includeAiProviderSecrets: false,
    preservePreferences: true,
  });
  for (const name of ['local', 'session'] as const) {
    const participant = createBrowserStorageParticipant({
      area: ctx.storage[name],
      id: `browser-storage:${name}`,
      keys: plan[name],
      prefixes: [],
      severity: 'required',
    });
    await participant.erase();
    expect((await participant.verifyEmpty()).status).toBe('verified-empty');
  }
  ctx.port.postMessage.mockClear();
  await ctx.service.reconnect();
  await hello(ctx);
  expect((await ctx.service.getStatus()).connectionState).toBe('trust-required');
  expect(ctx.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'extension.controller.acquire' })
  );
});

it('does not accept an unknown installation Quit after physical closure', async () => {
  vi.useFakeTimers();
  const ctx = setup();
  ctx.port.emitMessage(createNativeHello());
  ctx.port.emitMessage({ type: 'app.connection.closed', protocolVersion: 2, reason: 'user-quit' });
  ctx.port.emitDisconnect();
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  expect(await ctx.service.canAutoConnect()).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(ctx.connectNative).toHaveBeenCalledTimes(2);
});
