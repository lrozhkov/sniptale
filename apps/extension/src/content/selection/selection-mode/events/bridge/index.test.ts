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
import { cleanupSelectionModeRuntime, isSelectionModeExtensionUiElement } from '../../runtime';
import type { SelectionModeEventsBridgeRuntimeArgs } from './types';

vi.mock('../../../locker', () => ({ disableNavigationLock: vi.fn() }));
vi.mock('../../diag', () => ({ logSelectionModeDiag: vi.fn(), logSelectionModeError: vi.fn() }));
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
  const runtimeArgs = {
    state: { currentState: 'idle' },
  } as SelectionModeEventsBridgeRuntimeArgs;
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

function createInteractiveBridge() {
  const cleanupEvent = vi.fn();
  const disableCursor = vi.fn();
  const handleKeyDown = vi.fn();
  const resolveCallback = vi.fn();
  const rejectCallback = vi.fn();
  const runtimeArgs = {
    state: { currentState: 'hover' },
  } as SelectionModeEventsBridgeRuntimeArgs;

  return {
    bridge: createBridge({
      cleanupEvent,
      disableCursor,
      getRejectCallback: () => rejectCallback,
      getResolveCallback: () => resolveCallback,
      handleKeyDown,
      runtimeArgs,
    }),
    cleanupEvent,
    disableCursor,
    handleKeyDown,
    rejectCallback,
    resolveCallback,
    runtimeArgs,
  };
}

function invokeRuntimeBridgeActions(
  bridge: ReturnType<typeof createSelectionModeEventsBridge>
): void {
  bridge.constrainSelection();
  bridge.finalizeDragSelection();
  bridge.handleDragMove(new MouseEvent('mousemove'));
  bridge.handleResizeMove(new MouseEvent('mousemove'));
  bridge.hideHoverFrame();
  bridge.isExtensionUIElement(document.createElement('div'));
  bridge.resetToIdleState();
  bridge.selectElement(document.createElement('div'));
  bridge.showHoverFrame(document.createElement('div'));
  bridge.startDragSelection(11, 22);
  bridge.updateDragSelection(33, 44);
  bridge.updateFinalFrame();
}

describe('selection-mode events bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps confirm and cancel stable', () => {
    const {
      bridge,
      cleanupEvent,
      disableCursor,
      handleKeyDown,
      rejectCallback,
      resolveCallback,
      runtimeArgs,
    } = createInteractiveBridge();

    bridge.confirmSelection();
    bridge.cancelSelection();
    bridge.cleanup();

    expect(disableNavigationLock).toHaveBeenCalledTimes(2);
    expect(cleanupEvent).toHaveBeenCalledTimes(2);
    expect(disableCursor).toHaveBeenCalledTimes(1);
    expect(resolveCallback).toHaveBeenCalledWith({ x: 10, y: 21, width: 30, height: 41 });
    expect(rejectCallback.mock.calls[0]?.[0]).toEqual(new Error('Cancelled by user'));
    expect(cleanupSelectionModeRuntime).toHaveBeenCalledWith(runtimeArgs.state, handleKeyDown);
    expect(logSelectionModeError).not.toHaveBeenCalled();
  });

  it('keeps runtime event delegation stable', () => {
    const { bridge, runtimeArgs } = createInteractiveBridge();

    invokeRuntimeBridgeActions(bridge);

    expect(constrainSelectionModeSelection).toHaveBeenCalledWith(runtimeArgs);
    expect(finalizeSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs);
    expect(handleSelectionModeDragMove).toHaveBeenCalledWith(runtimeArgs, expect.any(MouseEvent));
    expect(handleSelectionModeResizeMove).toHaveBeenCalledWith(runtimeArgs, expect.any(MouseEvent));
    expect(hideSelectionModeHoverFrame).toHaveBeenCalledWith(runtimeArgs);
    expect(isSelectionModeExtensionUiElement).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(resetSelectionModeToIdleState).toHaveBeenCalledWith(runtimeArgs);
    expect(selectSelectionModeElement).toHaveBeenCalledWith(runtimeArgs, expect.any(HTMLElement));
    expect(showSelectionModeHoverFrame).toHaveBeenCalledWith(runtimeArgs, expect.any(HTMLElement));
    expect(startSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs, 11, 22);
    expect(updateSelectionModeDragSelection).toHaveBeenCalledWith(runtimeArgs, 33, 44);
    expect(updateSelectionModeFinalFrame).toHaveBeenCalledWith(runtimeArgs);
  });
});
