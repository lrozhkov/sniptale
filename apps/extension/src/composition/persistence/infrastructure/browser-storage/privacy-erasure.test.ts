import { expect, it, vi } from 'vitest';

const createStorageAreaAdapter = vi.hoisted(() =>
  vi.fn((areaName, guardMutations) => ({
    areaName,
    guardMutations,
  }))
);

vi.mock('./area-adapter', () => ({ createStorageAreaAdapter }));

import { privacyErasureBrowserStorage } from './privacy-erasure';

it('creates unguarded erasure areas without exposing storage change observation', () => {
  expect(createStorageAreaAdapter.mock.calls).toEqual([
    ['local', false],
    ['sync', false],
    ['session', false],
  ]);
  expect(privacyErasureBrowserStorage.canObserveChanges?.()).toBe(false);
  const listener = vi.fn();
  const unsubscribe = privacyErasureBrowserStorage.subscribeToChanges?.(listener);
  expect(unsubscribe).toEqual(expect.any(Function));
  unsubscribe?.();
  expect(listener).not.toHaveBeenCalled();
});
