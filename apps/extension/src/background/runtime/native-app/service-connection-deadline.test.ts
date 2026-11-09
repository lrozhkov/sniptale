import { createNativeAppRuntimeService } from './service';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createNativeHello,
  createNativeTestPort,
  installChromeRuntimeInfo,
} from './service.test-support';

vi.mock('../../capture/native-app/persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/native-app/persistence/staging')>()),
  cleanupStaleNativeTransferSessions: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  installChromeRuntimeInfo();
});

afterEach(() => vi.useRealTimers());

it('ends a silent handshake and permits an explicit retry on a new port', async () => {
  const silent = createNativeTestPort();
  const retry = createNativeTestPort();
  const connectNative = vi.fn().mockReturnValueOnce(silent).mockReturnValueOnce(retry);
  vi.useFakeTimers();
  const service = createNativeAppRuntimeService({ connectNative });
  service.connect();

  await vi.advanceTimersByTimeAsync(45_000);

  expect(await service.getStatus()).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      controllerLease: null,
      error: expect.objectContaining({
        message: 'Native app handshake timed out',
        recoverable: true,
      }),
    })
  );
  expect(silent.disconnect).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(connectNative).toHaveBeenCalledTimes(1);

  await service.reconnect();
  silent.emitMessage(createNativeHello());
  expect((await service.getStatus()).connectionState).toBe('connecting');
  retry.emitMessage(createNativeHello());
  await vi.advanceTimersByTimeAsync(0);
  expect((await service.getStatus()).connectionState).toBe('connected');
  service.disconnectForPermissionRevocation();
});
