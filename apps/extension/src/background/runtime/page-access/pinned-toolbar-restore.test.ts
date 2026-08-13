import { beforeEach, expect, it, vi } from 'vitest';

const restoreMocks = vi.hoisted(() => ({
  enableScreenshotModeGuarded: vi.fn(),
  ensureActivePageAccessRuntime: vi.fn(),
  hasActivePageAccess: vi.fn(),
  hasPinnedToolbarAllSitesAccess: vi.fn(),
  readPinToTabSessionStorageState: vi.fn(),
  readPinToTabToolbarVisibilitySessionStorageState: vi.fn(),
  waitForContentToolbarReady: vi.fn(),
}));

vi.mock('../../../composition/persistence/content-pin-session/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/content-pin-session/index')
  >()),
  readPinToTabSessionStorageState: restoreMocks.readPinToTabSessionStorageState,
  readPinToTabToolbarVisibilitySessionStorageState:
    restoreMocks.readPinToTabToolbarVisibilitySessionStorageState,
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  ensureActivePageAccessRuntime: restoreMocks.ensureActivePageAccessRuntime,
  hasActivePageAccess: restoreMocks.hasActivePageAccess,
  hasPinnedToolbarAllSitesAccess: restoreMocks.hasPinnedToolbarAllSitesAccess,
}));

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotModeGuarded: restoreMocks.enableScreenshotModeGuarded,
}));

vi.mock('./readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./readiness')>()),
  waitForContentToolbarReady: restoreMocks.waitForContentToolbarReady,
}));

import { restorePinnedToolbarAfterNavigation } from './pinned-toolbar-restore';
import {
  invalidatePinnedToolbarOperations,
  runPinnedToolbarPermissionCleanup,
} from './pinned-toolbar-operation';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createRestoreState() {
  return {
    screenshotModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map<number, 'capture-surface' | 'viewer'>(),
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >(),
    webSnapshotViewerPorts: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  restoreMocks.enableScreenshotModeGuarded.mockResolvedValue(true);
  restoreMocks.ensureActivePageAccessRuntime.mockResolvedValue(undefined);
  restoreMocks.hasActivePageAccess.mockResolvedValue(true);
  restoreMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValue(true);
  restoreMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  restoreMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(true);
  restoreMocks.waitForContentToolbarReady.mockResolvedValue({
    screenshotMode: false,
    visible: false,
  });
});

it('restores pinned preparation after a new document becomes ready', async () => {
  const state = createRestoreState();

  await expect(restorePinnedToolbarAfterNavigation(7, state)).resolves.toBe(true);

  expect(restoreMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
  expect(restoreMocks.waitForContentToolbarReady).toHaveBeenCalledWith(7);
  expect(restoreMocks.enableScreenshotModeGuarded).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts,
    expect.objectContaining({
      commitGuard: expect.any(Function),
      readPreparationState: expect.any(Function),
      toolbarVisible: true,
    })
  );
  expect(restoreMocks.ensureActivePageAccessRuntime.mock.invocationCallOrder[0]).toBeLessThan(
    restoreMocks.waitForContentToolbarReady.mock.invocationCallOrder[0] ?? 0
  );
  expect(restoreMocks.waitForContentToolbarReady.mock.invocationCallOrder[0]).toBeLessThan(
    restoreMocks.enableScreenshotModeGuarded.mock.invocationCallOrder[0] ?? 0
  );
});

it('keeps a collapsed pinned toolbar collapsed after navigation', async () => {
  const state = createRestoreState();
  restoreMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValueOnce(false);

  await expect(restorePinnedToolbarAfterNavigation(7, state)).resolves.toBe(true);

  expect(restoreMocks.enableScreenshotModeGuarded).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts,
    expect.objectContaining({
      commitGuard: expect.any(Function),
      readPreparationState: expect.any(Function),
      toolbarVisible: false,
    })
  );
});

it('does not enable preparation before the React toolbar bridge is ready', async () => {
  const toolbarReady = createDeferred<{ screenshotMode: boolean; visible: boolean }>();
  restoreMocks.waitForContentToolbarReady.mockReturnValueOnce(toolbarReady.promise);
  const restore = restorePinnedToolbarAfterNavigation(7, createRestoreState());

  await vi.waitFor(() => {
    expect(restoreMocks.waitForContentToolbarReady).toHaveBeenCalledWith(7);
  });
  expect(restoreMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();

  toolbarReady.resolve({ screenshotMode: false, visible: false });
  await expect(restore).resolves.toBe(true);
  expect(restoreMocks.enableScreenshotModeGuarded).toHaveBeenCalledOnce();
});

it('does not inject a runtime into an unpinned tab', async () => {
  restoreMocks.readPinToTabSessionStorageState.mockResolvedValue(false);

  await expect(restorePinnedToolbarAfterNavigation(7, createRestoreState())).resolves.toBe(false);

  expect(restoreMocks.hasActivePageAccess).not.toHaveBeenCalled();
  expect(restoreMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
});

it('keeps a pin dormant when page access is unavailable on the new origin', async () => {
  restoreMocks.hasActivePageAccess.mockResolvedValue(false);

  await expect(restorePinnedToolbarAfterNavigation(7, createRestoreState())).resolves.toBe(false);

  expect(restoreMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
  expect(restoreMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();
});

it('keeps a stored pin dormant without persistent all-sites access', async () => {
  restoreMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValueOnce(false);

  await expect(restorePinnedToolbarAfterNavigation(7, createRestoreState())).resolves.toBe(false);

  expect(restoreMocks.hasActivePageAccess).not.toHaveBeenCalled();
  expect(restoreMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
  expect(restoreMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();
});

it('does not enable preparation when navigation supersedes runtime injection', async () => {
  const runtimeReady = createDeferred<void>();
  restoreMocks.ensureActivePageAccessRuntime.mockReturnValueOnce(runtimeReady.promise);
  const restore = restorePinnedToolbarAfterNavigation(7, createRestoreState());
  await vi.waitFor(() => {
    expect(restoreMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
  });

  invalidatePinnedToolbarOperations(7);
  runtimeReady.resolve(undefined);

  await expect(restore).resolves.toBe(false);
  expect(restoreMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();
});

it('lets only the latest overlapping navigation restore enable preparation', async () => {
  const firstRuntimeReady = createDeferred<void>();
  restoreMocks.ensureActivePageAccessRuntime.mockReturnValueOnce(firstRuntimeReady.promise);
  const state = createRestoreState();
  const firstRestore = restorePinnedToolbarAfterNavigation(7, state);
  await vi.waitFor(() => {
    expect(restoreMocks.ensureActivePageAccessRuntime).toHaveBeenCalledTimes(1);
  });

  const secondRestore = restorePinnedToolbarAfterNavigation(7, state);
  firstRuntimeReady.resolve(undefined);

  await expect(firstRestore).resolves.toBe(false);
  await expect(secondRestore).resolves.toBe(true);
  expect(restoreMocks.ensureActivePageAccessRuntime).toHaveBeenCalledTimes(2);
  expect(restoreMocks.enableScreenshotModeGuarded).toHaveBeenCalledTimes(1);
});

it('rejects and rolls back a delayed final enable when all-sites authority is revoked', async () => {
  const finalEnable = createDeferred<void>();
  restoreMocks.enableScreenshotModeGuarded.mockImplementationOnce(
    async (
      _tabId: number,
      _screenshotModeState: Map<number, boolean>,
      _viewportState: Map<
        number,
        { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
      >,
      _viewportOwnerState: Map<number, 'capture-surface' | 'viewer'>,
      _ports: Map<number, unknown>,
      options: { commitGuard: () => Promise<boolean> }
    ) => {
      await finalEnable.promise;
      return options.commitGuard();
    }
  );
  const restore = restorePinnedToolbarAfterNavigation(7, createRestoreState());
  await vi.waitFor(() => {
    expect(restoreMocks.enableScreenshotModeGuarded).toHaveBeenCalledOnce();
  });

  restoreMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValue(false);
  const cleanup = runPinnedToolbarPermissionCleanup(async () => undefined);
  finalEnable.resolve(undefined);

  await expect(cleanup).resolves.toBeUndefined();
  await expect(restore).resolves.toBe(false);
});
