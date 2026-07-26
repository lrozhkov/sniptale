// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeEventsBridge } from '.';
import { createSelectionModeSession } from '../../session';
import { disableNavigationLock } from '../../../locker';
import { logSelectionModeError } from '../../diag';
import {
  constrainSelectionModeSelection,
  finalizeSelectionModeDragSelection,
  handleSelectionModeDragMove,
  handleSelectionModeResizeMove,
  hideSelectionModeHoverFrame,
  resetSelectionModeToIdleState,
  selectSelectionModeElement,
  showSelectionModeHoverFrame,
  startSelectionModeDragSelection,
  updateSelectionModeDragSelection,
  updateSelectionModeFinalFrame,
} from '../../runtime/drag';
import { cleanupSelectionModeRuntime } from '../../runtime/cleanup';
import { isSelectionModeExtensionUiElement } from '../../runtime/extension-ui';

const captureMenuMocks = vi.hoisted(() => ({
  closeSelectionCaptureActionMenu: vi.fn(() => true),
}));

vi.mock('../../ui/final-elements/capture-menu', () => ({
  closeSelectionCaptureActionMenu: captureMenuMocks.closeSelectionCaptureActionMenu,
  createSelectionCaptureActionControls: vi.fn(),
}));

vi.mock('../../../locker', () => ({
  disableNavigationLock: vi.fn(),
}));

vi.mock('../../diag', () => ({
  logSelectionModeDiag: vi.fn(),
  logSelectionModeError: vi.fn(),
}));

vi.mock('../../runtime/cleanup', () => ({
  cleanupSelectionModeRuntime: vi.fn(),
}));

vi.mock('../../runtime/extension-ui', () => ({
  isSelectionModeExtensionUiElement: vi.fn(),
}));

vi.mock('../../runtime/drag', () => ({
  constrainSelectionModeSelection: vi.fn(),
  finalizeSelectionModeDragSelection: vi.fn(),
  handleSelectionModeDragMove: vi.fn(),
  handleSelectionModeResizeMove: vi.fn(),
  hideSelectionModeHoverFrame: vi.fn(),
  resetSelectionModeToIdleState: vi.fn(),
  selectSelectionModeElement: vi.fn(),
  showSelectionModeHoverFrame: vi.fn(),
  startSelectionModeDragSelection: vi.fn(),
  updateSelectionModeDragSelection: vi.fn(),
  updateSelectionModeFinalFrame: vi.fn(),
}));

function createBridge(
  overrides: Partial<Parameters<typeof createSelectionModeEventsBridge>[0]> = {}
) {
  const state = createSelectionModeSession();
  state.currentSelection = { x: 10.2, y: 20.7, width: 30.4, height: 40.8 };
  const runtimeArgs = { flushFinalFrameUpdate: vi.fn(), state } as never;
  return createSelectionModeEventsBridge({
    cleanupEvent: vi.fn(),
    disableCursor: vi.fn(),
    handleKeyDown: vi.fn(),
    runtimeArgs,
    ...overrides,
  });
}

function registerResolveTest(): void {
  it('resolves the selection even if cleanup clears the stored callback', () => {
    const resolveCallback = vi.fn();
    const state = createSelectionModeSession();
    state.currentSelection = { x: 10.2, y: 20.7, width: 30.4, height: 40.8 };
    state.resolveCallback = resolveCallback;

    const bridge = createSelectionModeEventsBridge({
      cleanupEvent: () => {
        state.resolveCallback = null;
      },
      disableCursor: vi.fn(),
      handleKeyDown: vi.fn(),
      runtimeArgs: { state } as never,
    });

    bridge.confirmSelection();

    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(resolveCallback).toHaveBeenCalledWith({ x: 10, y: 21, width: 30, height: 41 });
  });
}

function registerRejectTest(): void {
  it('rejects the selection even if cleanup clears the stored callback', () => {
    const rejectCallback = vi.fn();
    const state = createSelectionModeSession();
    state.rejectCallback = rejectCallback;

    const bridge = createSelectionModeEventsBridge({
      cleanupEvent: () => {
        state.rejectCallback = null;
      },
      disableCursor: vi.fn(),
      handleKeyDown: vi.fn(),
      runtimeArgs: { state } as never,
    });

    bridge.cancelSelection();

    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(rejectCallback).toHaveBeenCalledTimes(1);
    expect(rejectCallback.mock.calls[0]?.[0]).toEqual(new Error('Cancelled by user'));
  });
}

function registerCleanupTest(): void {
  it('cleans up runtime state and disables the cursor through the bridge cleanup action', () => {
    const disableCursor = vi.fn();
    const handleKeyDown = vi.fn();
    const state = createSelectionModeSession();
    state.currentState = 'drag';
    const flushFinalFrameUpdate = vi.fn();
    const runtimeArgs = { flushFinalFrameUpdate, state } as never;
    const bridge = createBridge({
      disableCursor,
      handleKeyDown,
      runtimeArgs,
    });

    bridge.cleanup();

    expect(disableCursor).toHaveBeenCalledTimes(1);
    expect(cleanupSelectionModeRuntime).toHaveBeenCalledWith(state, handleKeyDown);
  });
}

function registerRuntimeActionsTest(): void {
  it('delegates runtime event actions to the selection-mode helpers', () => {
    vi.mocked(isSelectionModeExtensionUiElement).mockReturnValue(true);

    const state = createSelectionModeSession();
    state.currentState = 'hover';
    const flushFinalFrameUpdate = vi.fn();
    const runtimeArgs = { flushFinalFrameUpdate, state } as never;
    const bridge = createBridge({ runtimeArgs });
    const dragEvent = new MouseEvent('mousemove');
    const resizeEvent = new MouseEvent('mousemove');
    const element = document.createElement('div');
    const iframe = document.createElement('iframe');

    bridge.constrainSelection();
    expect(bridge.closeCaptureActionMenu(true)).toBe(true);
    bridge.finalizeDragSelection();
    bridge.flushFinalFrameUpdate();
    bridge.handleDragMove(dragEvent);
    bridge.handleResizeMove(resizeEvent);
    bridge.hideHoverFrame();
    expect(bridge.isExtensionUIElement(element)).toBe(true);
    bridge.resetToIdleState();
    bridge.selectElement(element, iframe);
    bridge.showHoverFrame(element, iframe);
    bridge.startDragSelection(11, 22);
    bridge.updateDragSelection(33, 44);
    bridge.updateFinalFrame();

    expect(constrainSelectionModeSelection).toHaveBeenCalledWith(runtimeArgs);
    expect(captureMenuMocks.closeSelectionCaptureActionMenu).toHaveBeenCalledWith(
      state.dom.overlayContainer,
      true
    );
    expect(finalizeSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs);
    expect(flushFinalFrameUpdate).toHaveBeenCalledTimes(1);
    expect(handleSelectionModeDragMove).toHaveBeenCalledWith(runtimeArgs, dragEvent);
    expect(handleSelectionModeResizeMove).toHaveBeenCalledWith(runtimeArgs, resizeEvent);
    expect(hideSelectionModeHoverFrame).toHaveBeenCalledWith(runtimeArgs);
    expect(isSelectionModeExtensionUiElement).toHaveBeenCalledWith(element);
    expect(resetSelectionModeToIdleState).toHaveBeenCalledWith(runtimeArgs);
    expect(selectSelectionModeElement).toHaveBeenCalledWith(runtimeArgs, element);
    expect(showSelectionModeHoverFrame).toHaveBeenCalledWith(runtimeArgs, element);
    expect(startSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs, 11, 22);
    expect(updateSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs, 33, 44);
    expect(updateSelectionModeFinalFrame).toHaveBeenCalledWith(runtimeArgs);
  });
}

function registerConfirmErrorTest(): void {
  it('rethrows confirm errors after logging them', () => {
    const error = new Error('cleanup failed');
    const bridge = createBridge({
      cleanupEvent: () => {
        throw error;
      },
    });

    expect(() => bridge.confirmSelection()).toThrow(error);
    expect(logSelectionModeError).toHaveBeenCalledWith('confirmSelection.failed', error);
  });
}

function registerCancelErrorTest(): void {
  it('rethrows cancel errors after logging them', () => {
    const error = new Error('cancel cleanup failed');
    const bridge = createBridge({
      cleanupEvent: () => {
        throw error;
      },
    });

    expect(() => bridge.cancelSelection()).toThrow(error);
    expect(logSelectionModeError).toHaveBeenCalledWith('cancelSelection.failed', error);
  });
}

describe('selection-mode events bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerResolveTest();
  registerRejectTest();
  registerCleanupTest();
  registerRuntimeActionsTest();
  registerConfirmErrorTest();
  registerCancelErrorTest();
});
