import { expect, it, vi } from 'vitest';

const pinSessionMocks = vi.hoisted(() => ({
  clearAnnotationForkSessionForTab: vi.fn(),
  clearPinnedToolbarOperationState: vi.fn(),
  clearPinToTabSessionStorageState: vi.fn(),
}));

vi.mock('../../../annotation-fork-session/route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../annotation-fork-session/route')>()),
  clearAnnotationForkSessionForTab: pinSessionMocks.clearAnnotationForkSessionForTab,
}));

vi.mock(
  '../../../../composition/persistence/content-pin-session/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/content-pin-session/index')
    >()),
    clearPinToTabSessionStorageState: pinSessionMocks.clearPinToTabSessionStorageState,
  })
);

vi.mock('../../page-access/pinned-toolbar-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/pinned-toolbar-operation')>()),
  clearPinnedToolbarOperationState: pinSessionMocks.clearPinnedToolbarOperationState,
}));

import {
  createModeState,
  cleanupScreenshotModeAfterTabClose,
  flushMicrotasks,
  handleTabClose,
  removedListenerRef,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerTabLifecycleListeners } from './tab-lifecycle';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

it('restores screenshot ownership before clearing mode state on tab removal', async () => {
  const state = createModeState();
  pinSessionMocks.clearPinToTabSessionStorageState.mockResolvedValue(undefined);
  pinSessionMocks.clearAnnotationForkSessionForTab.mockResolvedValue(undefined);

  registerTabLifecycleListeners(state, logger);
  removedListenerRef.current?.(7);
  await flushMicrotasks();

  expect(cleanupScreenshotModeAfterTabClose).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts
  );
  expect(state.screenshotModeState.has(7)).toBe(false);
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(state.viewportState.has(7)).toBe(false);
  expect(handleTabClose).toHaveBeenCalledWith(7);
  expect(pinSessionMocks.clearPinnedToolbarOperationState).toHaveBeenCalledWith(7);
  expect(pinSessionMocks.clearPinToTabSessionStorageState).toHaveBeenCalledWith(7);
  expect(pinSessionMocks.clearAnnotationForkSessionForTab).toHaveBeenCalledWith(7);
  expect(logger.log).toHaveBeenCalledWith('Tab closed, state cleared', 7);
});

it('logs pin-to-tab session cleanup failures without blocking tab close handling', async () => {
  const state = createModeState();
  const cleanupError = new Error('session unavailable');
  pinSessionMocks.clearPinToTabSessionStorageState.mockRejectedValue(cleanupError);

  registerTabLifecycleListeners(state, logger);
  removedListenerRef.current?.(7);
  await flushMicrotasks();

  expect(handleTabClose).toHaveBeenCalledWith(7);
  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to clear pin-to-tab state after tab close',
    cleanupError
  );
});

it('waits for video closed-tab cleanup before unwinding screenshot owners', async () => {
  const state = createModeState();
  let resolveVideoCleanup!: () => void;
  handleTabClose.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveVideoCleanup = resolve;
    })
  );

  registerTabLifecycleListeners(state, logger);
  removedListenerRef.current?.(7);
  await flushMicrotasks();
  expect(cleanupScreenshotModeAfterTabClose).not.toHaveBeenCalled();

  resolveVideoCleanup();
  await flushMicrotasks();
  expect(cleanupScreenshotModeAfterTabClose).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts
  );
});
