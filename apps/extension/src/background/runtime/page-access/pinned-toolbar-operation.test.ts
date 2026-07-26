import { expect, it, vi } from 'vitest';

import {
  beginPinnedToolbarOperation,
  clearPinnedToolbarOperationState,
  invalidatePinnedToolbarOperations,
  observePinnedToolbarOperations,
  runPinnedToolbarPermissionCleanup,
} from './pinned-toolbar-operation';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it('invalidates an older operation as soon as a newer intent begins', async () => {
  const first = beginPinnedToolbarOperation(7);
  const firstRelease = createDeferred<void>();
  const firstWork = first.runExclusive(async () => {
    await firstRelease.promise;
    return first.isCurrent();
  });
  const second = beginPinnedToolbarOperation(7);

  expect(first.isCurrent()).toBe(false);
  expect(second.isCurrent()).toBe(true);

  firstRelease.resolve(undefined);
  await expect(firstWork).resolves.toBe(false);
  await expect(second.runExclusive(async () => second.isCurrent())).resolves.toBe(true);
});

it('serializes finalization work while allowing a newer intent to supersede pending work', async () => {
  const events: string[] = [];
  const firstRelease = createDeferred<void>();
  const first = beginPinnedToolbarOperation(8);
  const firstWork = first.runExclusive(async () => {
    events.push('first-start');
    await firstRelease.promise;
    events.push('first-end');
  });
  const second = beginPinnedToolbarOperation(8);
  const secondWork = second.runExclusive(async () => {
    events.push('second');
  });

  await vi.waitFor(() => {
    expect(events).toEqual(['first-start']);
  });
  firstRelease.resolve(undefined);
  await Promise.all([firstWork, secondWork]);
  expect(events).toEqual(['first-start', 'first-end', 'second']);
});

it('invalidates pending work on navigation and tab cleanup', () => {
  const navigationOperation = beginPinnedToolbarOperation(9);
  invalidatePinnedToolbarOperations(9);
  expect(navigationOperation.isCurrent()).toBe(false);

  const closingTabOperation = beginPinnedToolbarOperation(10);
  clearPinnedToolbarOperationState(10);
  expect(closingTabOperation.isCurrent()).toBe(false);
});

it('lets passive restoration observe without superseding a current mutation', () => {
  const mutation = beginPinnedToolbarOperation(11);
  const passiveRestore = observePinnedToolbarOperations(11);

  expect(mutation.isCurrent()).toBe(true);
  expect(passiveRestore.isCurrent()).toBe(true);

  beginPinnedToolbarOperation(11);
  expect(mutation.isCurrent()).toBe(false);
  expect(passiveRestore.isCurrent()).toBe(false);
});

it('blocks newer authoritative work behind permission cleanup', async () => {
  const cleanupRelease = createDeferred<void>();
  const events: string[] = [];
  const cleanup = runPinnedToolbarPermissionCleanup(async () => {
    events.push('cleanup-start');
    await cleanupRelease.promise;
    events.push('cleanup-end');
  });
  const newerPin = beginPinnedToolbarOperation(12);
  const pinWork = newerPin.runExclusive(async () => {
    events.push('pin');
  });

  await vi.waitFor(() => {
    expect(events).toEqual(['cleanup-start']);
  });
  cleanupRelease.resolve(undefined);
  await Promise.all([cleanup, pinWork]);
  expect(events).toEqual(['cleanup-start', 'cleanup-end', 'pin']);
});
