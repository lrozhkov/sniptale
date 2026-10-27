import { beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import type { SecurityE2ESyncWorkspaceSelection } from '.';

const { connectListener } = vi.hoisted(() => ({
  connectListener: { current: null as ((port: chrome.runtime.Port) => void) | null },
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    subscribeToConnections: vi.fn((listener: (port: chrome.runtime.Port) => void) => {
      connectListener.current = listener;
      return vi.fn();
    }),
  },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function createPort(url: string) {
  return createRuntimePortFixture({
    name: 'sniptale:security-e2e-control:v1',
    sender: { url },
  });
}

beforeEach(() => {
  vi.resetModules();
  connectListener.current = null;
  Object.defineProperty(globalThis, '__SNIPTALE_SECURITY_E2E__', {
    configurable: true,
    value: true,
  });
});

it('accepts only the exact security harness sender and known checkpoints', async () => {
  const control = await import('.');
  control.registerSecurityE2EControl();
  const rejected = createPort('chrome-extension://test/apps/extension/src/settings/index.html');
  connectListener.current?.(rejected.port);
  rejected.onMessage.emit({ requestId: 'rejected', type: 'snapshot' });
  expect(rejected.postMessage).not.toHaveBeenCalled();

  const accepted = createPort('chrome-extension://test/tooling/test/harness/security-control.html');
  connectListener.current?.(accepted.port);
  accepted.onMessage.emit({ requestId: '1', type: 'pause', checkpoint: 'unknown' });
  expect(accepted.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ ok: false, requestId: '1' })
  );
});

it('pauses and releases a named checkpoint', async () => {
  const control = await import('.');
  control.registerSecurityE2EControl();
  const accepted = createPort('chrome-extension://test/tooling/test/harness/security-control.html');
  connectListener.current?.(accepted.port);
  accepted.onMessage.emit({
    checkpoint: 'persistence-before-commit',
    requestId: 'pause',
    type: 'pause',
  });
  let completed = false;
  const checkpoint = control.securityE2ECheckpoint('persistence-before-commit').then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  accepted.onMessage.emit({
    checkpoint: 'persistence-before-commit',
    requestId: 'release',
    type: 'release',
  });
  await checkpoint;
  expect(completed).toBe(true);
});

it('does not treat a historical unpaused checkpoint as a paused operation', async () => {
  const control = await import('.');
  await control.securityE2ECheckpoint('persistence-before-commit');
  control.registerSecurityE2EControl();
  const accepted = createPort('chrome-extension://test/tooling/test/harness/security-control.html');
  connectListener.current?.(accepted.port);
  accepted.onMessage.emit({
    checkpoint: 'persistence-before-commit',
    requestId: 'pause',
    type: 'pause',
  });
  accepted.onMessage.emit({
    checkpoint: 'persistence-before-commit',
    requestId: 'wait',
    type: 'wait-until-paused',
  });
  expect(accepted.port.postMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ requestId: 'wait' })
  );

  const checkpoint = control.securityE2ECheckpoint('persistence-before-commit');
  expect(accepted.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ ok: true, requestId: 'wait' })
  );
  accepted.onMessage.emit({
    checkpoint: 'persistence-before-commit',
    requestId: 'release',
    type: 'release',
  });
  await checkpoint;
});

const syncRequestId = '11111111-1111-4111-8111-111111111111';
const executorId = '22222222-2222-4222-8222-222222222222';
const startupId = '33333333-3333-4333-8333-333333333333';
const syncSelection = {
  scope: { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 },
  authorization: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 2 },
  operationId: '55555555-5555-4555-8555-555555555555',
  expectedRevision: 1,
};
const workspaceSelection = {
  allocation: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 2 },
  authentication: { kind: 'basic' as const, username: 'alice', password: 'synthetic-secret' },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function syncRuntime() {
  return {
    start: vi.fn(async (_selection: typeof syncSelection) => ({ executorId, executorRevision: 2 })),
    startWorkspace: vi.fn(async (_selection: SecurityE2ESyncWorkspaceSelection) => ({
      executorId,
      executorRevision: 2,
    })),
    inspect: vi.fn(async () => ({
      offscreenStartupId: startupId,
      executorId,
      executorRevision: 2,
      phase: 'idle' as const,
      binding: null,
      workspace: null,
      jobs: [],
    })),
    reserveErasure: vi.fn(() => ({ quiesce: vi.fn(async () => {}), release: vi.fn() })),
    erase: vi.fn(async () => true),
  };
}
function syncPort() {
  const fixture = createPort('chrome-extension://test/tooling/test/harness/security-control.html');
  const answer = deferred<unknown>();
  fixture.postMessage.mockImplementation((value: unknown) => answer.resolve(value));
  connectListener.current?.(fixture.port);
  return { ...fixture, answer: answer.promise };
}

it('passes only a parsed native selection to the injected runtime and ACKs its short start receipt', async () => {
  const control = await import('.');
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  const port = syncPort();
  port.onMessage.emit({ type: 'sync-start', requestId: syncRequestId, payload: syncSelection });
  await expect(port.answer).resolves.toEqual({
    ok: true,
    requestId: syncRequestId,
    sync: { executorId, executorRevision: 2 },
  });
  expect(runtime.start).toHaveBeenCalledExactlyOnceWith(syncSelection);
  expect(runtime.start.mock.calls[0]?.[0]).not.toBe(syncSelection);
});

it.each([
  null,
  {},
  { ...syncSelection, expectedRevision: 0 },
  { ...syncSelection, expectedRevision: 1.5 },
  { ...syncSelection, authorization: { ...syncSelection.authorization, revision: 0 } },
  {
    ...syncSelection,
    authorization: { ...syncSelection.authorization, password: 'synthetic-secret' },
  },
  { ...syncSelection, scope: { ...syncSelection.scope, rootUrl: 'https://dav.test/' } },
  { ...syncSelection, authentication: { password: 'synthetic-secret' } },
])(
  'refuses a malformed or secret-bearing sync selection without invoking the runtime',
  async (payload) => {
    const control = await import('.');
    const runtime = syncRuntime();
    control.registerSecurityE2EControl(runtime);
    const port = syncPort();
    port.onMessage.emit({ type: 'sync-start', requestId: syncRequestId, payload });
    await expect(port.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
    expect(runtime.start).not.toHaveBeenCalled();
  }
);

it('returns only the parsed safe executor snapshot', async () => {
  const control = await import('.');
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  const port = syncPort();
  port.onMessage.emit({ type: 'sync-inspect', requestId: syncRequestId });
  await expect(port.answer).resolves.toEqual({
    ok: true,
    requestId: syncRequestId,
    sync: {
      offscreenStartupId: startupId,
      executorId,
      executorRevision: 2,
      phase: 'idle',
      binding: null,
      workspace: null,
      jobs: [],
    },
  });
  expect(runtime.inspect).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'releases the erasure reservation after sync-stop settles (failure %s)',
  async (failure) => {
    const control = await import('.');
    const runtime = syncRuntime();
    const reached = deferred<void>();
    const drained = deferred<void>();
    const release = vi.fn();
    runtime.reserveErasure.mockReturnValue({
      quiesce: vi.fn(async () => {
        reached.resolve();
        return drained.promise;
      }),
      release,
    });
    control.registerSecurityE2EControl(runtime);
    const port = syncPort();
    port.onMessage.emit({ type: 'sync-stop', requestId: syncRequestId });
    await reached.promise;
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    if (failure) drained.reject(new Error('synthetic-secret-must-not-be-reported'));
    else drained.resolve();
    await expect(port.answer).resolves.toEqual({
      ok: !failure,
      requestId: syncRequestId,
      sync: null,
    });
    expect(release).toHaveBeenCalledOnce();
  }
);

it.each([false, true])(
  'returns the actual privacy use case success result %s without a production ingress',
  async (success) => {
    const control = await import('.');
    const runtime = syncRuntime();
    runtime.erase.mockResolvedValue(success);
    control.registerSecurityE2EControl(runtime);
    const port = syncPort();
    port.onMessage.emit({ type: 'sync-erase', requestId: syncRequestId });
    await expect(port.answer).resolves.toEqual({
      ok: true,
      requestId: syncRequestId,
      sync: success,
    });
    expect(runtime.erase).toHaveBeenCalledOnce();
  }
);

it('exposes no injected runtime failure text on the test port', async () => {
  const control = await import('.');
  const runtime = syncRuntime();
  runtime.erase.mockRejectedValue(new Error('synthetic-private-provider-error'));
  control.registerSecurityE2EControl(runtime);
  const port = syncPort();
  port.onMessage.emit({ type: 'sync-erase', requestId: syncRequestId });
  await expect(port.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
});

it('refuses lifecycle commands without an injected runtime and rejects extra control payloads', async () => {
  const control = await import('.');
  control.registerSecurityE2EControl();
  const missing = syncPort();
  missing.onMessage.emit({ type: 'sync-inspect', requestId: syncRequestId });
  await expect(missing.answer).resolves.toEqual({
    ok: false,
    requestId: syncRequestId,
    sync: null,
  });
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  const extra = syncPort();
  extra.onMessage.emit({ type: 'sync-inspect', requestId: syncRequestId, payload: syncSelection });
  await expect(extra.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
  expect(runtime.inspect).not.toHaveBeenCalled();
});

it('keeps lifecycle commands behind the exact security harness sender and port name', async () => {
  const control = await import('.');
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  for (const options of [
    {
      name: 'sniptale:security-e2e-control:v1',
      sender: { url: 'chrome-extension://test/settings.html' },
    },
    {
      name: 'other',
      sender: { url: 'chrome-extension://test/tooling/test/harness/security-control.html' },
    },
  ]) {
    const port = createRuntimePortFixture(options);
    connectListener.current?.(port.port);
    for (const command of [
      { type: 'sync-start', payload: syncSelection },
      { type: 'sync-workspace-start', payload: workspaceSelection },
    ])
      port.onMessage.emit({ ...command, requestId: syncRequestId });
    expect(port.postMessage).not.toHaveBeenCalled();
  }
  expect(runtime.start).not.toHaveBeenCalled();
  expect(runtime.startWorkspace).not.toHaveBeenCalled();
});

it('does not register a lifecycle ingress when the security E2E build flag is disabled', async () => {
  Object.defineProperty(globalThis, '__SNIPTALE_SECURITY_E2E__', {
    configurable: true,
    value: false,
  });
  const control = await import('.');
  control.registerSecurityE2EControl(syncRuntime());
  expect(connectListener.current).toBeNull();
});

it.each([
  workspaceSelection.authentication,
  { kind: 'bearer' as const, accessToken: 'synthetic-token' },
])(
  'starts workspace creation with detached bounded credentials and returns only a receipt',
  async (authentication) => {
    const control = await import('.');
    const runtime = syncRuntime();
    const receipt = deferred<{ executorId: string; executorRevision: number }>();
    runtime.startWorkspace.mockReturnValueOnce(receipt.promise);
    control.registerSecurityE2EControl(runtime);
    const port = syncPort();
    const payload = { allocation: { ...workspaceSelection.allocation }, authentication };
    port.onMessage.emit({ type: 'sync-workspace-start', requestId: syncRequestId, payload });
    expect(runtime.startWorkspace).toHaveBeenCalledExactlyOnceWith(payload);
    expect(runtime.startWorkspace.mock.calls[0]?.[0].allocation).not.toBe(payload.allocation);
    expect(runtime.startWorkspace.mock.calls[0]?.[0].authentication).not.toBe(authentication);
    expect(port.postMessage).not.toHaveBeenCalled();
    payload.allocation.revision = 99;
    expect(runtime.startWorkspace.mock.calls[0]?.[0].allocation.revision).toBe(2);
    receipt.resolve({ executorId, executorRevision: 2 });
    await expect(port.answer).resolves.toEqual({
      ok: true,
      requestId: syncRequestId,
      sync: { executorId, executorRevision: 2 },
    });
    expect(runtime.start).not.toHaveBeenCalled();
  }
);

it.each([
  null,
  {},
  { ...workspaceSelection, extra: true },
  { ...workspaceSelection, allocation: { ...workspaceSelection.allocation, revision: 0 } },
  { ...workspaceSelection, allocation: { ...workspaceSelection.allocation, extra: true } },
  { ...workspaceSelection, authentication: { ...workspaceSelection.authentication, extra: true } },
  { ...workspaceSelection, authentication: { ...workspaceSelection.authentication, username: '' } },
  {
    ...workspaceSelection,
    authentication: { ...workspaceSelection.authentication, username: 'x'.repeat(1025) },
  },
  {
    ...workspaceSelection,
    authentication: { ...workspaceSelection.authentication, password: 'x'.repeat(8193) },
  },
  {
    ...workspaceSelection,
    authentication: { ...workspaceSelection.authentication, password: 'bad\nsecret' },
  },
  { ...workspaceSelection, authentication: { kind: 'bearer', accessToken: 'x'.repeat(8193) } },
  { ...workspaceSelection, authentication: { kind: 'bearer', accessToken: 'bad\ntoken' } },
])('refuses malformed workspace starts before invoking the runtime', async (payload) => {
  const control = await import('.');
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  const port = syncPort();
  port.onMessage.emit({ type: 'sync-workspace-start', requestId: syncRequestId, payload });
  await expect(port.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
  expect(runtime.startWorkspace).not.toHaveBeenCalled();
});

it('does not expose workspace credential failure text and refuses extra command fields', async () => {
  const control = await import('.');
  const runtime = syncRuntime();
  control.registerSecurityE2EControl(runtime);
  const extra = syncPort();
  extra.onMessage.emit({
    type: 'sync-workspace-start',
    requestId: syncRequestId,
    payload: workspaceSelection,
    extra: true,
  });
  await expect(extra.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
  expect(runtime.startWorkspace).not.toHaveBeenCalled();
  const port = syncPort();
  runtime.startWorkspace.mockRejectedValueOnce(new Error('synthetic-private-password'));
  port.onMessage.emit({
    type: 'sync-workspace-start',
    requestId: syncRequestId,
    payload: workspaceSelection,
  });
  await expect(port.answer).resolves.toEqual({ ok: false, requestId: syncRequestId, sync: null });
});
