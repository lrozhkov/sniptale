import { expect, it, vi } from 'vitest';

import { createScenarioSessionPersistedWriteQueue } from './persisted-write';

function createDeferred() {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

it('serializes persisted write tasks after a failed write settles', async () => {
  const runPersistedWrite = createScenarioSessionPersistedWriteQueue();
  const first = createDeferred();
  const events: string[] = [];

  const firstWrite = runPersistedWrite(async () => {
    events.push('first-start');
    await first.promise;
  });
  const secondWrite = runPersistedWrite(async () => {
    events.push('second-start');
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toEqual(['first-start']);

  first.reject(new Error('first failed'));
  await expect(firstWrite).rejects.toThrow('first failed');
  await expect(secondWrite).resolves.toBeUndefined();

  expect(events).toEqual(['first-start', 'second-start']);
});

it('keeps independent queues from blocking each other', async () => {
  const firstQueue = createScenarioSessionPersistedWriteQueue();
  const secondQueue = createScenarioSessionPersistedWriteQueue();
  const blocker = createDeferred();
  const secondTask = vi.fn();

  const firstWrite = firstQueue(async () => {
    await blocker.promise;
  });
  const secondWrite = secondQueue(async () => {
    secondTask();
  });

  await expect(secondWrite).resolves.toBeUndefined();
  expect(secondTask).toHaveBeenCalledOnce();

  blocker.resolve();
  await expect(firstWrite).resolves.toBeUndefined();
});
