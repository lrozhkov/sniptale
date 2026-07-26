// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../../application/runtime-services/services.test-support';

const runtimeMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));

vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: runtimeMocks.sendRuntimeMessage,
}));

import { writeContentPinToTabSessionState } from './pin-session';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  await flushMicrotasks();
  installContentRuntimeMessagingMock(runtimeMocks.sendRuntimeMessage);
  runtimeMocks.sendRuntimeMessage.mockReset();
});

it('serializes a newer unpin after an older delayed pin write', async () => {
  const pinResponse = createDeferred<{
    pinToTab: boolean;
    restored: boolean;
    success: boolean;
  }>();
  runtimeMocks.sendRuntimeMessage
    .mockReturnValueOnce(pinResponse.promise)
    .mockResolvedValueOnce({ pinToTab: false, restored: false, success: true });

  const pin = writeContentPinToTabSessionState(true);
  await flushMicrotasks();
  const unpin = writeContentPinToTabSessionState(false);
  await flushMicrotasks();

  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledTimes(1);
  pinResponse.resolve({ pinToTab: true, restored: true, success: true });
  await expect(pin).resolves.toEqual({ status: 'acknowledged', value: true });
  await expect(unpin).resolves.toEqual({ status: 'acknowledged', value: false });

  expect(runtimeMocks.sendRuntimeMessage.mock.calls).toEqual([
    [{ pinToTab: true, type: 'CONTENT_RUNTIME_WAKEUP' }],
    [{ pinToTab: false, type: 'CONTENT_RUNTIME_WAKEUP' }],
  ]);
});

it('does not send an older queued write after a newer generation supersedes it', async () => {
  let generation = 0;
  const write = (value: boolean) => {
    const writeGeneration = generation + 1;
    generation = writeGeneration;
    return writeContentPinToTabSessionState(value, () => generation === writeGeneration);
  };
  runtimeMocks.sendRuntimeMessage.mockResolvedValue({
    pinToTab: false,
    restored: false,
    success: true,
  });

  const pin = write(true);
  const unpin = write(false);

  await expect(pin).resolves.toEqual({ status: 'superseded' });
  await expect(unpin).resolves.toEqual({ status: 'acknowledged', value: false });
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledTimes(1);
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    pinToTab: false,
    type: 'CONTENT_RUNTIME_WAKEUP',
  });
});

it('continues the write queue after an earlier runtime failure', async () => {
  runtimeMocks.sendRuntimeMessage
    .mockRejectedValueOnce(new Error('runtime unavailable'))
    .mockResolvedValueOnce({ pinToTab: false, restored: false, success: true });

  const pin = writeContentPinToTabSessionState(true);
  const unpin = writeContentPinToTabSessionState(false);

  await expect(pin).rejects.toThrow('runtime unavailable');
  await expect(unpin).resolves.toEqual({ status: 'acknowledged', value: false });
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
});
