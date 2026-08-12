import { beforeEach, expect, it, vi } from 'vitest';
import {
  resetVideoRecordingMediaMutationQueueForTests,
  runSerializedVideoRecordingMediaMutation,
} from './mutation-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

beforeEach(resetVideoRecordingMediaMutationQueueForTests);

it('does not start a newer device transaction before the previous rollback settles', async () => {
  const first = deferred<void>();
  const order: string[] = [];
  const firstOperation = runSerializedVideoRecordingMediaMutation('surface-1', async () => {
    order.push('first-start');
    await first.promise;
    order.push('first-end');
    throw new Error('durable write failed');
  });
  const secondOperation = vi.fn(async () => {
    order.push('second');
    return 'accepted';
  });
  const second = runSerializedVideoRecordingMediaMutation('surface-1', secondOperation);

  await Promise.resolve();
  expect(secondOperation).not.toHaveBeenCalled();
  first.resolve();
  await expect(firstOperation).rejects.toThrow('durable write failed');
  await expect(second).resolves.toBe('accepted');
  expect(order).toEqual(['first-start', 'first-end', 'second']);
});

it('does not serialize independent surfaces together', async () => {
  const first = deferred<void>();
  const other = vi.fn(async () => 'accepted');
  const pending = runSerializedVideoRecordingMediaMutation('surface-1', () => first.promise);
  await expect(runSerializedVideoRecordingMediaMutation('surface-2', other)).resolves.toBe(
    'accepted'
  );
  expect(other).toHaveBeenCalledOnce();
  first.resolve();
  await pending;
});
