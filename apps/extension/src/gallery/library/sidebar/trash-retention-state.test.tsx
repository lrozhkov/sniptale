// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStoragePolicy } from '../../../contracts/settings';
import { useTrashRetentionPolicy } from './trash-retention-state';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  patch: vi.fn(),
  subscribe: vi.fn(),
  listener: null as ((settings: { localStoragePolicy: LocalStoragePolicy }) => void) | null,
  unsubscribe: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', () => ({
  loadSettings: mocks.load,
  patchLocalStoragePolicy: mocks.patch,
  subscribeToSettingsChanges: mocks.subscribe,
  StaleLocalStoragePolicyError: class StaleLocalStoragePolicyError extends Error {},
}));

const base: LocalStoragePolicy = {
  cleanupEnabled: true,
  defaultDestination: 'temporary',
  draftRetentionDays: 30,
  videoDraftRetentionDays: 7,
  trashCleanupEnabled: false,
  trashRetentionDays: 30,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
let state: ReturnType<typeof useTrashRetentionPolicy>;

function Probe() {
  state = useTrashRetentionPolicy();
  return null;
}

function emit(policy: LocalStoragePolicy) {
  act(() => mocks.listener?.({ localStoragePolicy: policy }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.listener = null;
  mocks.subscribe.mockImplementation((listener) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('subscribes before reading, and a live event wins over a late initial read', async () => {
  const load = deferred<{ localStoragePolicy: LocalStoragePolicy }>();
  mocks.load.mockReturnValue(load.promise);
  await act(async () => root.render(<Probe />));
  expect(mocks.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.load.mock.invocationCallOrder[0]!
  );
  const external = { ...base, trashCleanupEnabled: true, trashRetentionDays: 7 };
  emit(external);
  expect(state.policy).toEqual(external);
  await act(async () => load.resolve({ localStoragePolicy: base }));
  expect(state.policy).toEqual(external);
  expect(state.status).toBe('ready');
});

it('shows unavailable on initial load failure and retries without showing defaults as saved', async () => {
  mocks.load
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ localStoragePolicy: base });
  await act(async () => root.render(<Probe />));
  expect(state).toMatchObject({ status: 'unavailable', policy: null });
  await act(async () => state.onRetry());
  expect(state).toMatchObject({ status: 'ready', policy: base });
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

it('retains the committed value after a failed save and retries the same patch', async () => {
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    localStoragePolicy: { ...base, trashRetentionDays: 7 },
  });
  await act(async () => root.render(<Probe />));
  await act(async () => state.onChange({ trashRetentionDays: 7 }));
  expect(state).toMatchObject({ policy: base, saving: false, feedback: 'error' });
  await act(async () => state.onRetry());
  expect(mocks.patch).toHaveBeenNthCalledWith(2, { trashRetentionDays: 7 }, base);
  expect(state).toMatchObject({ policy: { ...base, trashRetentionDays: 7 }, feedback: null });
});

it('commits an automatic save without success feedback', async () => {
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockResolvedValue({ localStoragePolicy: { ...base, trashCleanupEnabled: true } });
  await act(async () => root.render(<Probe />));
  vi.useFakeTimers();
  try {
    await act(async () => state.onChange({ trashCleanupEnabled: true }));
    expect(state.feedback).toBeNull();
    act(() => vi.advanceTimersByTime(3000));
    expect(state.feedback).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('blocks duplicate input while saving and preserves a newer external policy', async () => {
  const save = deferred<{ localStoragePolicy: LocalStoragePolicy }>();
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockReturnValue(save.promise);
  await act(async () => root.render(<Probe />));
  act(() => state.onChange({ trashRetentionDays: 7 }));
  expect(state.saving).toBe(true);
  act(() => state.onChange({ trashRetentionDays: 14 }));
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  const external = { ...base, trashRetentionDays: 90 };
  emit(external);
  await act(async () => save.resolve({ localStoragePolicy: { ...base, trashRetentionDays: 7 } }));
  expect(state).toMatchObject({ policy: external, saving: false, feedback: null });
});

it('invalidates a failed retry on an external commit and unsubscribes on disposal', async () => {
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockRejectedValue(new Error('offline'));
  await act(async () => root.render(<Probe />));
  await act(async () => state.onChange({ trashRetentionDays: 7 }));
  expect(state.feedback).toBe('error');
  emit({ ...base, trashRetentionDays: 14 });
  expect(state.feedback).toBeNull();
  await act(async () => state.onRetry());
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  root = createRoot(container);
});
