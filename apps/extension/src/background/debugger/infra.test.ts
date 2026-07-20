import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getPlatformInfoMock } = vi.hoisted(() => ({
  getPlatformInfoMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getPlatformInfo: getPlatformInfoMock,
  },
}));

import { keepServiceWorkerAlive, withTimeout } from './infra';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  getPlatformInfoMock.mockResolvedValue({
    arch: 'x86-64',
    nacl_arch: 'x86-64',
    os: 'linux',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

it('keeps the service worker alive and swallows keepalive probe failures', async () => {
  getPlatformInfoMock.mockRejectedValueOnce(new Error('keepalive failed'));

  const stopKeepAlive = keepServiceWorkerAlive();
  await vi.advanceTimersByTimeAsync(20000);
  await vi.advanceTimersByTimeAsync(20000);
  stopKeepAlive();
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).toHaveBeenCalledTimes(2);
});

it('cleans up the keepalive timer when the wrapped promise settles', async () => {
  const promise = withTimeout(Promise.resolve('done'), 1000, 'demo');

  await expect(promise).resolves.toBe('done');
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).not.toHaveBeenCalled();
});

it('rejects with the original error and stops keepalive polling', async () => {
  const promise = withTimeout(Promise.reject(new Error('boom')), 1000, 'demo');

  await expect(promise).rejects.toThrow('boom');
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).not.toHaveBeenCalled();
});

it('times out pending work and clears the keepalive interval', async () => {
  const pendingPromise = new Promise<string>(() => undefined);
  const promise = withTimeout(pendingPromise, 1000, 'stalled operation');
  const timeoutAssertion = expect(promise).rejects.toThrow(
    'Timeout (1000ms) during stalled operation'
  );

  await vi.advanceTimersByTimeAsync(1000);
  await timeoutAssertion;
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).not.toHaveBeenCalled();
});

it('ignores late promise resolution after a timeout', async () => {
  let resolvePending!: (value: string) => void;
  const pendingPromise = new Promise<string>((resolve) => {
    resolvePending = resolve;
  });
  const promise = withTimeout(pendingPromise, 1000, 'late resolve');
  const timeoutAssertion = expect(promise).rejects.toThrow('Timeout (1000ms) during late resolve');

  await vi.advanceTimersByTimeAsync(1000);
  await timeoutAssertion;

  resolvePending('done');
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).not.toHaveBeenCalled();
});

it('ignores late promise rejection after a timeout', async () => {
  let rejectPending!: (error: Error) => void;
  const pendingPromise = new Promise<string>((_resolve, reject) => {
    rejectPending = reject;
  });
  const promise = withTimeout(pendingPromise, 1000, 'late reject');
  const timeoutAssertion = expect(promise).rejects.toThrow('Timeout (1000ms) during late reject');

  await vi.advanceTimersByTimeAsync(1000);
  await timeoutAssertion;

  rejectPending(new Error('too late'));
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20000);

  expect(getPlatformInfoMock).not.toHaveBeenCalled();
});
