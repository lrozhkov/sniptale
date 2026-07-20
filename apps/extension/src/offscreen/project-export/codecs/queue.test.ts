import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { waitForEncoderQueueCapacity } from './queue';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('waits until the encoder queue drops under the requested capacity', async () => {
  const encoder = { encodeQueueSize: 8 } as VideoEncoder;
  let reads = 0;

  Object.defineProperty(encoder, 'encodeQueueSize', {
    configurable: true,
    get() {
      reads += 1;
      return reads < 3 ? 8 : 2;
    },
  });

  const waiting = waitForEncoderQueueCapacity(encoder, 4);
  await vi.advanceTimersByTimeAsync(8);
  await expect(waiting).resolves.toBeUndefined();
});

it('returns immediately when the encoder queue is already within capacity', async () => {
  const encoder = { encodeQueueSize: 2 } as VideoEncoder;

  await expect(waitForEncoderQueueCapacity(encoder, 4)).resolves.toBeUndefined();
});

it('throws immediately when cancellation is already requested', async () => {
  const controller = new AbortController();
  controller.abort();

  const encoder = { encodeQueueSize: 9 } as VideoEncoder;

  await expect(waitForEncoderQueueCapacity(encoder, 4, controller.signal)).rejects.toThrow(
    'The export was aborted.'
  );
});

it('rejects queue waiting when export cancellation aborts the loop', async () => {
  const controller = new AbortController();
  const encoder = { encodeQueueSize: 9 } as VideoEncoder;

  const waiting = waitForEncoderQueueCapacity(encoder, 4, controller.signal);
  controller.abort();

  await expect(waiting).rejects.toThrow('The export was aborted.');
});
