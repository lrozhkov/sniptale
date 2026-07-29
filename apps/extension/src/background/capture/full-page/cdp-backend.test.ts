import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  arm: vi.fn(() => ({ token: 'activation' })),
  attach: vi.fn(),
  detach: vi.fn(),
  detachPersisted: vi.fn(),
  sendCommand: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: { sendCommand: mocks.sendCommand },
}));
vi.mock('../../debugger/session/activation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/activation')>()),
  armDebuggerActivation: mocks.arm,
}));
vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger: mocks.attach,
}));
vi.mock('../../debugger/session/detach', () => ({ detachDebugger: mocks.detach }));
vi.mock('../../debugger/session/detach-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/detach-core')>()),
  detachPersistedDebuggerClient: mocks.detachPersisted,
}));

import {
  createCdpFullPageRasterBackend,
  hasOwnedCdpLease,
  recoverOwnedCdpLease,
  releaseOwnedCdpLease,
} from './cdp-backend';
import { DEBUGGER_TIMEOUT_MS } from '../../debugger/constants';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attach.mockResolvedValue('target-1');
  mocks.detach.mockResolvedValue(undefined);
  mocks.detachPersisted.mockResolvedValue(undefined);
  mocks.sendCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ data: 'tile' });
});

afterEach(() => {
  vi.useRealTimers();
});

it('captures viewport-only PNG tiles and releases only its owner-scoped screenshot client', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-1', tabId: 9 });
  await expect(backend.captureFrame()).resolves.toBe('data:image/png;base64,tile');
  await backend.release();

  expect(mocks.attach).toHaveBeenCalledWith(9, 'screenshot', { token: 'activation' });
  expect(mocks.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  expect(mocks.detach).toHaveBeenCalledWith(9, 'screenshot');
});

it('does not detach when the supplied owner token does not own the lease', async () => {
  await createCdpFullPageRasterBackend({ ownerToken: 'owner-2', tabId: 10 });
  await releaseOwnedCdpLease(10, 'stale-owner');
  expect(mocks.detach).not.toHaveBeenCalled();
  await releaseOwnedCdpLease(10, 'owner-2');
});

it('rejects competing owners and stale raster handles', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-a', tabId: 11 });
  await expect(
    createCdpFullPageRasterBackend({ ownerToken: 'owner-b', tabId: 11 })
  ).rejects.toThrow('busy');
  await backend.release();
  await expect(backend.captureFrame()).rejects.toThrow('lease is stale');
});

it('releases its owned debugger lease when Page.enable fails', async () => {
  const failure = new Error('Page.enable failed');
  mocks.sendCommand.mockReset().mockRejectedValueOnce(failure);

  await expect(
    createCdpFullPageRasterBackend({ ownerToken: 'owner-failed', tabId: 12 })
  ).rejects.toBe(failure);

  expect(mocks.detach).toHaveBeenCalledWith(12, 'screenshot');
});

it('retains owner authority after detach fails and permits an exact retry', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-retry', tabId: 13 });
  mocks.detach.mockRejectedValueOnce(new Error('detach failed')).mockResolvedValueOnce(undefined);

  await expect(backend.release()).rejects.toThrow('detach failed');
  expect(hasOwnedCdpLease(13, 'owner-retry')).toBe(true);

  await expect(backend.release()).resolves.toBeUndefined();
  expect(hasOwnedCdpLease(13, 'owner-retry')).toBe(false);
  expect(mocks.detach).toHaveBeenCalledTimes(2);
});

it('uses persisted recovery semantics for a matching live owner and retires a missing target', async () => {
  await createCdpFullPageRasterBackend({ ownerToken: 'owner-recovery', tabId: 20 });

  await expect(recoverOwnedCdpLease(20, 'owner-recovery')).resolves.toBeUndefined();

  expect(mocks.detachPersisted).toHaveBeenCalledWith(20, 'screenshot');
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(hasOwnedCdpLease(20, 'owner-recovery')).toBe(false);
});

it('retains a matching live owner when persisted recovery still fails', async () => {
  await createCdpFullPageRasterBackend({ ownerToken: 'owner-recovery-retry', tabId: 21 });
  const failure = new Error('persisted detach failed');
  mocks.detachPersisted.mockRejectedValueOnce(failure);

  await expect(recoverOwnedCdpLease(21, 'owner-recovery-retry')).rejects.toBe(failure);

  expect(hasOwnedCdpLease(21, 'owner-recovery-retry')).toBe(true);
  await releaseOwnedCdpLease(21, 'owner-recovery-retry');
});

it('bounds a stalled screenshot command below the page-agent watchdog window', async () => {
  vi.useFakeTimers();
  mocks.sendCommand
    .mockReset()
    .mockResolvedValueOnce(undefined)
    .mockReturnValueOnce(new Promise(() => {}));
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-timeout', tabId: 14 });

  const capture = expect(backend.captureFrame()).rejects.toThrow(
    'Page.captureScreenshot for full-page capture'
  );
  await vi.advanceTimersByTimeAsync(DEBUGGER_TIMEOUT_MS);

  await capture;
  await backend.release();
});

it('preserves both Page.enable and owned detach failures', async () => {
  const enableFailure = new Error('enable failed');
  const detachFailure = new Error('detach failed');
  mocks.sendCommand.mockReset().mockRejectedValueOnce(enableFailure);
  mocks.detach.mockRejectedValueOnce(detachFailure).mockResolvedValueOnce(undefined);

  await expect(
    createCdpFullPageRasterBackend({ ownerToken: 'owner-init-fail', tabId: 15 })
  ).rejects.toMatchObject({ errors: [enableFailure, detachFailure] });
  expect(hasOwnedCdpLease(15, 'owner-init-fail')).toBe(true);
  await releaseOwnedCdpLease(15, 'owner-init-fail');
});

it('captures successfully through a live cancellation signal', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-signal', tabId: 16 });
  const controller = new AbortController();

  await expect(backend.captureFrame(controller.signal)).resolves.toBe('data:image/png;base64,tile');
  await backend.release();
});

it('rejects an already-aborted screenshot before accepting its result', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-aborted', tabId: 17 });
  const controller = new AbortController();
  const failure = new Error('cancelled before frame');
  controller.abort(failure);

  await expect(backend.captureFrame(controller.signal)).rejects.toBe(failure);
  await backend.release();
});

it('rejects cancellation while a screenshot command is pending', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-pending', tabId: 18 });
  mocks.sendCommand.mockReset();
  let resolveFrame: (value: unknown) => void = () => undefined;
  mocks.sendCommand.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFrame = resolve;
      })
  );
  const controller = new AbortController();
  const failure = new Error('cancelled pending frame');
  const capture = expect(backend.captureFrame(controller.signal)).rejects.toBe(failure);

  controller.abort(failure);
  resolveFrame({ data: 'late-tile' });

  await capture;
  await backend.release();
});

it('preserves screenshot command rejection through a live signal', async () => {
  const backend = await createCdpFullPageRasterBackend({ ownerToken: 'owner-rejected', tabId: 19 });
  const failure = new Error('capture rejected');
  mocks.sendCommand.mockReset().mockRejectedValueOnce(failure);

  await expect(backend.captureFrame(new AbortController().signal)).rejects.toBe(failure);
  await backend.release();
});
