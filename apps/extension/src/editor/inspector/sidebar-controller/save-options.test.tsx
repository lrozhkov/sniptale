// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const loadEditorSaveOptionsMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  loadEditorSaveOptions: loadEditorSaveOptionsMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

import { useInspectorSidebarSaveOptionsState } from './save-options';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness() {
  let latestValue: ReturnType<typeof useInspectorSidebarSaveOptionsState> | null = null;

  function Harness() {
    latestValue = useInspectorSidebarSaveOptionsState();
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });

  return () => latestValue;
}

function createDeferredPromise<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('loads persisted save options into sidebar state', async () => {
  loadEditorSaveOptionsMock.mockResolvedValue({
    defaultImagePresetId: 'preset-default',
    presets: [{ enabled: true, id: 'preset-default', name: 'Default', order: 0, path: 'out' }],
  });
  const getState = renderHarness();

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getState()?.defaultImagePresetId).toBe('preset-default');
  expect(getState()?.savePresets).toHaveLength(1);
});

it('falls back to empty save options and surfaces load failures', async () => {
  loadEditorSaveOptionsMock.mockRejectedValueOnce(new Error('failed'));
  const getState = renderHarness();

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getState()?.defaultImagePresetId).toBeNull();
  expect(getState()?.savePresets).toEqual([]);
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
});

it('ignores late save-option resolutions after the hook unmounts', async () => {
  const deferred = createDeferredPromise<Awaited<ReturnType<typeof loadEditorSaveOptionsMock>>>();
  loadEditorSaveOptionsMock.mockReturnValueOnce(deferred.promise);
  renderHarness();

  act(() => {
    root?.unmount();
  });

  await act(async () => {
    deferred.resolve({
      defaultImagePresetId: 'preset-default',
      presets: [{ enabled: true, id: 'preset-default', name: 'Default', order: 0, path: 'out' }],
    });
    await Promise.resolve();
  });

  expect(toastErrorMock).not.toHaveBeenCalled();
});

it('ignores late save-option failures after the hook unmounts', async () => {
  const deferred = createDeferredPromise<Awaited<ReturnType<typeof loadEditorSaveOptionsMock>>>();
  loadEditorSaveOptionsMock.mockReturnValueOnce(deferred.promise);
  renderHarness();

  act(() => {
    root?.unmount();
  });

  await act(async () => {
    deferred.reject(new Error('failed'));
    await Promise.resolve();
  });

  expect(toastErrorMock).not.toHaveBeenCalled();
});
