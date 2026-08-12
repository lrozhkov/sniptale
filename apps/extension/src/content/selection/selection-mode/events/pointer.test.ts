// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  handleSelectionModeDragStart,
  handleSelectionModeMouseDown,
  handleSelectionModeMouseLeave,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseUp,
} from './pointer-handlers';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from './types';

function createState(
  overrides: Partial<SelectionModeInteractionState> = {}
): SelectionModeInteractionState {
  return {
    aspectRatio: null,
    currentSelection: { x: 100, y: 80, width: 120, height: 90 },
    currentState: 'idle',
    dragStartPoint: { x: 0, y: 0 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    resizeDirection: null,
    selectionAtDragStart: { x: 100, y: 80, width: 120, height: 90 },
    skipNextClick: false,
    ...overrides,
  };
}

function createOptions(): SelectionModeEventOptions {
  return {
    cancelSelection: vi.fn(),
    closeCaptureActionMenu: vi.fn(() => false),
    confirmSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
    flushFinalFrameUpdate: vi.fn(),
    handleDragMove: vi.fn(),
    handleResizeMove: vi.fn(),
    hideHoverFrame: vi.fn(),
    isExtensionUIElement: vi.fn(() => false),
    resetToIdleState: vi.fn(),
    selectElement: vi.fn(),
    showHoverFrame: vi.fn(),
    startDragSelection: vi.fn(),
    updateDragSelection: vi.fn(),
  };
}

function createPointerEvent(
  target: HTMLElement | null,
  coords: { clientX: number; clientY: number },
  type = 'mousemove'
): MouseEvent {
  const event = new MouseEvent(type, {
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
  });
  Object.defineProperties(event, {
    composedPath: { configurable: true, value: () => (target ? [target] : []) },
    target: { configurable: true, value: target },
  });
  return event;
}

function registerHideHoverTest() {
  it('hides hover previews when leaving the viewport or moving over extension UI', () => {
    const target = document.createElement('div');
    const state = createState({ currentState: 'hover' });
    const options = createOptions();
    vi.mocked(options.isExtensionUIElement).mockReturnValue(true);

    handleSelectionModeMouseLeave(state, options);
    handleSelectionModeMouseMove(
      createPointerEvent(target, { clientX: 30, clientY: 40 }),
      state,
      options
    );

    expect(options.hideHoverFrame).toHaveBeenCalledTimes(2);
    expect(options.showHoverFrame).not.toHaveBeenCalled();
  });
}

function registerThresholdDragTest() {
  it('captures the pointer on mouse down and updates the area once movement crosses the threshold', () => {
    const target = document.createElement('section');
    const state = createState();
    const options = createOptions();
    vi.mocked(options.startDragSelection).mockImplementation(() => {
      state.currentState = 'drag';
    });

    handleSelectionModeMouseDown(
      createPointerEvent(target, { clientX: 10, clientY: 20 }, 'mousedown'),
      state,
      options
    );

    handleSelectionModeMouseMove(
      createPointerEvent(target, { clientX: 24, clientY: 33 }),
      state,
      options
    );

    expect(state.hoveredElement).toBe(target);
    expect(state.hasMovedEnough).toBe(true);
    expect(options.showHoverFrame).not.toHaveBeenCalled();
    expect(options.startDragSelection).toHaveBeenCalledWith(10, 20);
    expect(options.updateDragSelection).toHaveBeenCalledWith(24, 33);
  });
}

function registerConfirmedMotionTest() {
  it('delegates confirmed-pointer motion to drag and resize handlers', () => {
    const target = document.createElement('div');
    const dragState = createState({ currentState: 'confirmed', isDragging: true });
    const resizeState = createState({
      currentState: 'confirmed',
      isResizing: true,
      resizeDirection: 'e',
    });
    const options = createOptions();
    const event = createPointerEvent(target, { clientX: 180, clientY: 140 });

    handleSelectionModeMouseMove(event, dragState, options);
    handleSelectionModeMouseMove(event, resizeState, options);

    expect(options.handleDragMove).toHaveBeenCalledWith(event);
    expect(options.handleResizeMove).toHaveBeenCalledWith(event);
  });
}

function registerDragFinalizeTest() {
  it('captures confirmed-frame interactions on mouse down and finalizes drag mode on mouse up', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-selection-final-frame';
    const state = createState({ currentState: 'confirmed' });
    const options = createOptions();
    const downEvent = createPointerEvent(target, { clientX: 150, clientY: 110 });
    vi.spyOn(downEvent, 'preventDefault');
    vi.spyOn(downEvent, 'stopImmediatePropagation');
    vi.spyOn(downEvent, 'stopPropagation');

    handleSelectionModeMouseDown(downEvent, state, options);

    expect(state.isDragging).toBe(true);
    expect(state.selectionAtDragStart).toEqual({ x: 100, y: 80, width: 120, height: 90 });
    expect(downEvent.preventDefault).toHaveBeenCalledOnce();

    state.currentState = 'drag';
    state.mouseDownPoint = { x: 150, y: 110 };
    state.hasMovedEnough = true;

    handleSelectionModeMouseUp(new MouseEvent('mouseup', { cancelable: true }), state, options);

    expect(options.finalizeDragSelection).toHaveBeenCalledTimes(1);
    expect(state.mouseDownPoint).toBeNull();
    expect(state.hasMovedEnough).toBe(false);
  });
}

function registerSkipNextClickTest() {
  it('marks confirmed pointer interactions to skip the follow-up click', () => {
    const state = createState({
      currentState: 'confirmed',
      isDragging: true,
      isResizing: true,
      resizeDirection: 'se',
      mouseDownPoint: { x: 90, y: 70 },
      hasMovedEnough: true,
    });
    const options = createOptions();

    handleSelectionModeMouseUp(new MouseEvent('mouseup', { cancelable: true }), state, options);

    expect(options.flushFinalFrameUpdate).toHaveBeenCalledTimes(1);
    expect(state.skipNextClick).toBe(true);
    expect(state.isDragging).toBe(false);
    expect(state.isResizing).toBe(false);
    expect(state.resizeDirection).toBeNull();
    expect(state.mouseDownPoint).toBeNull();
    expect(state.hasMovedEnough).toBe(false);
  });
}

function registerAnchorDragFallbackTest() {
  it('finishes a dragged region from an anchor even when the host suppresses intermediate moves', () => {
    const anchor = document.createElement('a');
    anchor.href = '/target';
    const state = createState({
      currentState: 'hover',
      hoveredElement: anchor,
      mouseDownPoint: { x: 20, y: 30 },
    });
    const options = createOptions();
    const mouseUp = new MouseEvent('mouseup', {
      cancelable: true,
      clientX: 140,
      clientY: 120,
    });
    vi.spyOn(mouseUp, 'preventDefault');

    handleSelectionModeMouseUp(mouseUp, state, options);

    expect(options.startDragSelection).toHaveBeenCalledWith(20, 30);
    expect(options.updateDragSelection).toHaveBeenCalledWith(140, 120);
    expect(options.finalizeDragSelection).toHaveBeenCalledOnce();
    expect(state.skipNextClick).toBe(true);
    expect(mouseUp.preventDefault).toHaveBeenCalledOnce();
  });
}

function registerAnchorNativeDragTest() {
  it('converts an anchor native drag into region selection without waiting for mouseup', () => {
    const anchor = document.createElement('a');
    anchor.href = '/target';
    const state = createState({
      currentState: 'hover',
      hoveredElement: anchor,
      mouseDownPoint: { x: 20, y: 30 },
    });
    const options = createOptions();
    const dragStart = new MouseEvent('dragstart', {
      cancelable: true,
      clientX: 140,
      clientY: 120,
    }) as DragEvent;
    vi.spyOn(dragStart, 'preventDefault');
    vi.spyOn(dragStart, 'stopImmediatePropagation');

    handleSelectionModeDragStart(dragStart, state, options);

    expect(options.startDragSelection).toHaveBeenCalledWith(20, 30);
    expect(options.updateDragSelection).toHaveBeenCalledWith(140, 120);
    expect(state.hasMovedEnough).toBe(true);
    expect(dragStart.preventDefault).toHaveBeenCalledOnce();
    expect(dragStart.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
}

describe('selection-mode pointer events', () => {
  registerHideHoverTest();
  registerThresholdDragTest();
  registerConfirmedMotionTest();
  registerDragFinalizeTest();
  registerSkipNextClickTest();
  registerAnchorDragFallbackTest();
  registerAnchorNativeDragTest();
});
