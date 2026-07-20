import { expect, it, vi } from 'vitest';

import { createStorageWriteQueue } from './write-queue';

it('serializes writes and continues after a rejected task', async () => {
  const enqueue = createStorageWriteQueue();
  const calls: string[] = [];
  const firstGate = Promise.withResolvers<void>();
  const secondTask = vi.fn(async () => {
    calls.push('second');
  });

  const first = enqueue(async () => {
    calls.push('first:start');
    await firstGate.promise;
    calls.push('first:reject');
    throw new Error('write failed');
  });
  const second = enqueue(secondTask);

  expect(secondTask).not.toHaveBeenCalled();
  firstGate.resolve();
  await expect(first).rejects.toThrow('write failed');
  await second;

  expect(calls).toEqual(['first:start', 'first:reject', 'second']);
});
