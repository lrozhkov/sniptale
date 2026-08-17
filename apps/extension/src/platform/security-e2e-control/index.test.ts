import { beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';

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
