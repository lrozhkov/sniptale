// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CaptureActionType } from '../../../../contracts/settings';
import { useCaptureActionPersistence } from './persistence';

const { patchSettingsMock } = vi.hoisted(() => ({
  patchSettingsMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  patchSettings: patchSettingsMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let lastHandler: ((action: CaptureActionType) => Promise<void>) | null = null;

function TestHarness(props: {
  captureAction: CaptureActionType;
  closeMenus: (except?: 'capture' | 'timer' | 'viewport' | null) => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onCaptureActionCommitted?: (action: CaptureActionType) => Promise<void> | void;
}) {
  lastHandler = useCaptureActionPersistence(
    props.captureAction,
    props.onCaptureActionChange,
    props.closeMenus,
    props.onCaptureActionCommitted
  );
  return null;
}

async function renderHarness(props: ComponentProps<typeof TestHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TestHarness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  lastHandler = null;
  patchSettingsMock.mockResolvedValue(undefined);
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

it('does not reload persisted capture action when the toolbar renders download as the current selection', async () => {
  await renderHarness({
    captureAction: 'download_default',
    closeMenus: vi.fn(),
    onCaptureActionChange: vi.fn(),
  });

  expect(patchSettingsMock).not.toHaveBeenCalled();
});

it('persists the newly selected capture action after updating local toolbar state', async () => {
  const closeMenus = vi.fn();
  const onCaptureActionChange = vi.fn();
  const onCaptureActionCommitted = vi.fn(async () => undefined);

  await renderHarness({
    captureAction: 'copy',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted,
  });

  await act(async () => {
    await lastHandler?.('download_default');
  });

  expect(onCaptureActionChange).toHaveBeenCalledWith('download_default');
  expect(closeMenus).toHaveBeenCalledWith(null);
  expect(onCaptureActionCommitted).toHaveBeenCalledWith('download_default');
  expect(patchSettingsMock).toHaveBeenCalledWith({ captureAction: 'download_default' });
});

it('closes the capture action menu before asynchronous persistence completes', async () => {
  const closeMenus = vi.fn();
  const onCaptureActionChange = vi.fn();
  const deferredCommit = createDeferred<void>();

  await renderHarness({
    captureAction: 'copy',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted: () => deferredCommit.promise,
  });

  let persistPromise: Promise<void> | undefined;
  await act(async () => {
    persistPromise = lastHandler?.('download_default');
    await Promise.resolve();
  });

  expect(closeMenus).toHaveBeenCalledWith(null);
  expect(patchSettingsMock).not.toHaveBeenCalled();

  deferredCommit.resolve();
  await act(async () => {
    await persistPromise;
  });
  expect(patchSettingsMock).toHaveBeenCalledWith({ captureAction: 'download_default' });
});

it('rolls back the capture action when persistence fails after closing the menu', async () => {
  const closeMenus = vi.fn();
  const onCaptureActionChange = vi.fn();
  patchSettingsMock.mockRejectedValueOnce(new Error('storage unavailable'));

  await renderHarness({
    captureAction: 'copy',
    closeMenus,
    onCaptureActionChange,
  });

  await act(async () => {
    await lastHandler?.('download_default');
  });

  expect(closeMenus).toHaveBeenCalledWith(null);
  expect(onCaptureActionChange).toHaveBeenNthCalledWith(1, 'download_default');
  expect(onCaptureActionChange).toHaveBeenLastCalledWith('copy');
});

it('does not let an older persistence failure roll back a newer selected action', async () => {
  const closeMenus = vi.fn();
  const onCaptureActionChange = vi.fn();
  const firstCommit = createDeferred<void>();
  const onCaptureActionCommitted = vi.fn((action: CaptureActionType) =>
    action === 'download_default' ? firstCommit.promise : Promise.resolve()
  );

  await renderHarness({
    captureAction: 'copy',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted,
  });
  let firstPersistPromise: Promise<void> | undefined;
  await act(async () => {
    firstPersistPromise = lastHandler?.('download_default');
    await Promise.resolve();
  });
  await renderHarness({
    captureAction: 'download_default',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted,
  });

  await act(async () => {
    await lastHandler?.('scenario');
    firstCommit.reject(new Error('old write failed'));
    await firstPersistPromise;
  });

  expect(onCaptureActionChange).toHaveBeenNthCalledWith(1, 'download_default');
  expect(onCaptureActionChange).toHaveBeenNthCalledWith(2, 'scenario');
  expect(onCaptureActionChange).toHaveBeenCalledTimes(2);
});

it('does not let an older delayed commit overwrite newer persisted settings', async () => {
  const closeMenus = vi.fn();
  const onCaptureActionChange = vi.fn();
  const firstCommit = createDeferred<void>();
  const onCaptureActionCommitted = vi.fn((action: CaptureActionType) =>
    action === 'download_default' ? firstCommit.promise : Promise.resolve()
  );

  await renderHarness({
    captureAction: 'copy',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted,
  });
  const firstPersistPromise = requestCaptureActionPersistence('download_default');
  await renderHarness({
    captureAction: 'download_default',
    closeMenus,
    onCaptureActionChange,
    onCaptureActionCommitted,
  });

  await act(async () => {
    await lastHandler?.('scenario');
    firstCommit.resolve();
    await firstPersistPromise;
  });

  expect(patchSettingsMock).toHaveBeenCalledTimes(1);
  expect(patchSettingsMock).toHaveBeenCalledWith({ captureAction: 'scenario' });
});

function requestCaptureActionPersistence(action: CaptureActionType) {
  let persistPromise: Promise<void> | undefined;
  act(() => {
    persistPromise = lastHandler?.(action);
  });
  return persistPromise;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
