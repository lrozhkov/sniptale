// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeEventsBridge } from '.';
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
} from '../../interaction/actions/runtime';
import {
  buildSelectionCaptureArea,
  cleanupSelectionModeRuntime,
  isSelectionModeExtensionUiElement,
} from '../../runtime';

vi.mock('../../../locker', () => ({
  disableNavigationLock: vi.fn(),
}));

vi.mock('../../diag', () => ({
  logSelectionModeDiag: vi.fn(),
  logSelectionModeError: vi.fn(),
}));

vi.mock('../../runtime', () => ({
  buildSelectionCaptureArea: vi.fn(
    (selection: { x: number; y: number; width: number; height: number }) => ({
      x: Math.round(selection.x),
      y: Math.round(selection.y),
      width: Math.round(selection.width),
      height: Math.round(selection.height),
    })
  ),
  cleanupSelectionModeRuntime: vi.fn(),
  isSelectionModeExtensionUiElement: vi.fn(),
}));

vi.mock('../../interaction/actions/runtime', () => ({
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
  const runtimeArgs = { state: { currentState: 'idle' } } as never;
  return createSelectionModeEventsBridge({
    cleanupEvent: vi.fn(),
    currentSelection: () => ({ x: 10.2, y: 20.7, width: 30.4, height: 40.8 }),
    disableCursor: vi.fn(),
    getRejectCallback: () => null,
    getResolveCallback: () => null,
    handleKeyDown: vi.fn(),
    runtimeArgs,
    ...overrides,
  });
}

function registerResolveTest(): void {
  it('resolves the selection even if cleanup clears the stored callback', () => {
    const resolveCallback = vi.fn();
    let currentResolve: typeof resolveCallback | null = resolveCallback;

    const bridge = createSelectionModeEventsBridge({
      cleanupEvent: () => {
        currentResolve = null;
      },
      currentSelection: () => ({ x: 10.2, y: 20.7, width: 30.4, height: 40.8 }),
      disableCursor: vi.fn(),
      getRejectCallback: () => null,
      getResolveCallback: () => currentResolve,
      handleKeyDown: vi.fn(),
      runtimeArgs: {} as never,
    });

    bridge.confirmSelection();

    expect(disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(resolveCallback).toHaveBeenCalledWith({ x: 10, y: 21, width: 30, height: 41 });
  });
}

function registerRejectTest(): void {
  it('rejects the selection even if cleanup clears the stored callback', () => {
    const rejectCallback = vi.fn();
    let currentReject: typeof rejectCallback | null = rejectCallback;

    const bridge = createSelectionModeEventsBridge({
      cleanupEvent: () => {
        currentReject = null;
      },
      currentSelection: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      disableCursor: vi.fn(),
      getRejectCallback: () => currentReject,
      getResolveCallback: () => null,
      handleKeyDown: vi.fn(),
      runtimeArgs: {} as never,
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
    const state = { currentState: 'dragging' };
    const runtimeArgs = { state } as never;
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

    const runtimeArgs = { state: { currentState: 'hover' } } as never;
    const bridge = createBridge({ runtimeArgs });
    const dragEvent = new MouseEvent('mousemove');
    const resizeEvent = new MouseEvent('mousemove');
    const element = document.createElement('div');
    const iframe = document.createElement('iframe');

    bridge.constrainSelection();
    bridge.finalizeDragSelection();
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
    expect(finalizeSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs);
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
    expect(buildSelectionCaptureArea).toHaveBeenCalledTimes(1);
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
