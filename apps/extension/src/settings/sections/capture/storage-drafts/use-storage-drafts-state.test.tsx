// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStoragePolicy } from '../../../../contracts/settings';
import { useStorageDraftsState } from './use-storage-drafts-state';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  patch: vi.fn(),
  subscribe: vi.fn(),
  listener: null as ((settings: { localStoragePolicy: LocalStoragePolicy }) => void) | null,
  unsubscribe: vi.fn(),
  usage: vi.fn(),
  estimate: vi.fn(),
  cleanup: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', () => ({
  loadSettings: mocks.load,
  patchLocalStoragePolicy: mocks.patch,
  subscribeToSettingsChanges: mocks.subscribe,
  StaleLocalStoragePolicyError: class StaleLocalStoragePolicyError extends Error {},
}));
vi.mock('../../../../composition/persistence/library-lifecycle', () => ({
  DEFAULT_LOCAL_STORAGE_POLICY: {
    cleanupEnabled: true,
    defaultDestination: 'temporary',
    draftRetentionDays: 30,
    videoDraftRetentionDays: 7,
    trashCleanupEnabled: false,
    trashRetentionDays: 30,
  },
  cleanupDrafts: mocks.cleanup,
  getLibraryStorageUsage: mocks.usage,
}));
vi.mock('../../../../features/media-hub/storage-capacity', () => ({
  getStorageEstimateInfo: mocks.estimate,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));

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
let state: ReturnType<typeof useStorageDraftsState>;

function Probe() {
  state = useStorageDraftsState();
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
  mocks.usage.mockResolvedValue({ draftsBytes: 1, libraryBytes: 2 });
  mocks.estimate.mockResolvedValue({ remaining: 3, usage: 3 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('subscribes before load and lets a live event defeat the late initial result', async () => {
  const load = deferred<{ localStoragePolicy: LocalStoragePolicy }>();
  mocks.load.mockReturnValue(load.promise);
  await act(async () => root.render(<Probe />));
  expect(mocks.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.load.mock.invocationCallOrder[0]!
  );
  const external = { ...base, trashCleanupEnabled: true, trashRetentionDays: 7 };
  emit(external);
  await act(async () => load.resolve({ localStoragePolicy: base }));
  expect(state).toMatchObject({ policy: external, policyLoaded: true, policyLoadFailed: false });
});

it('reports load failure and retries without treating defaults as loaded policy', async () => {
  mocks.load
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ localStoragePolicy: base });
  await act(async () => root.render(<Probe />));
  expect(state).toMatchObject({ policyLoaded: false, policyLoadFailed: true, busy: false });
  await act(async () => state.retryLoad());
  expect(state).toMatchObject({ policy: base, policyLoaded: true, policyLoadFailed: false });
});

it('retains the last committed policy after failed save and accepts a later retry', async () => {
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    localStoragePolicy: { ...base, trashRetentionDays: 7 },
  });
  await act(async () => root.render(<Probe />));
  await act(async () => state.updatePolicy({ trashRetentionDays: 7 }));
  expect(state).toMatchObject({ policy: base, busy: false, trashPolicyFeedback: 'error' });
  expect(mocks.toast).toHaveBeenCalled();
  await act(async () => state.retryTrashPolicy());
  expect(mocks.patch).toHaveBeenNthCalledWith(2, { trashRetentionDays: 7 }, base);
  expect(state.policy.trashRetentionDays).toBe(7);
  expect(state.trashPolicyFeedback).toBe('saved');
});

it('blocks duplicate writes and does not let an in-flight save replace an external commit', async () => {
  const save = deferred<{ localStoragePolicy: LocalStoragePolicy }>();
  mocks.load.mockResolvedValue({ localStoragePolicy: base });
  mocks.patch.mockReturnValue(save.promise);
  await act(async () => root.render(<Probe />));
  act(() => {
    void state.updatePolicy({ trashRetentionDays: 7 });
  });
  expect(state.busy).toBe(true);
  expect(state.trashPolicyFeedback).toBe('saving');
  act(() => {
    void state.updatePolicy({ trashRetentionDays: 14 });
  });
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  const external = { ...base, trashRetentionDays: 90 };
  emit(external);
  expect(state.trashPolicyFeedback).toBeNull();
  await act(async () => save.resolve({ localStoragePolicy: { ...base, trashRetentionDays: 7 } }));
  expect(state).toMatchObject({ policy: external, busy: false });
});

it('ignores a late load after disposal and removes its subscription', async () => {
  const load = deferred<{ localStoragePolicy: LocalStoragePolicy }>();
  mocks.load.mockReturnValue(load.promise);
  await act(async () => root.render(<Probe />));
  act(() => root.unmount());
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => load.resolve({ localStoragePolicy: base }));
  root = createRoot(container);
});
