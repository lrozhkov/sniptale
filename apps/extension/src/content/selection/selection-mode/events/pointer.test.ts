// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  handleSelectionModeMouseDown,
  handleSelectionModeMouseLeave,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseUp,
} from './pointer';
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
    confirmSelection: vi.fn(),
    finalizeDragSelection: vi.fn(),
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
  coords: { clientX: number; clientY: number }
): MouseEvent {
  return {
    clientX: coords.clientX,
    clientY: coords.clientY,
    composedPath: () => (target ? [target] : []),
    target,
  } as unknown as MouseEvent;
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
  it('starts a drag selection once the pointer crosses the drag threshold', () => {
    const target = document.createElement('section');
    const state = createState({
      currentState: 'idle',
      mouseDownPoint: { x: 10, y: 20 },
    });
    const options = createOptions();

    handleSelectionModeMouseMove(
      createPointerEvent(target, { clientX: 24, clientY: 33 }),
      state,
      options
    );

    expect(state.hoveredElement).toBe(target);
    expect(state.hasMovedEnough).toBe(true);
    expect(options.showHoverFrame).toHaveBeenCalledWith(target, undefined);
    expect(options.startDragSelection).toHaveBeenCalledWith(10, 20);
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
    const downEvent = {
      ...createPointerEvent(target, { clientX: 150, clientY: 110 }),
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;

    handleSelectionModeMouseDown(downEvent, state, options);

    expect(state.isDragging).toBe(true);
    expect(state.selectionAtDragStart).toEqual({ x: 100, y: 80, width: 120, height: 90 });
    expect(downEvent.preventDefault).toHaveBeenCalledOnce();

    state.currentState = 'drag';
    state.mouseDownPoint = { x: 150, y: 110 };
    state.hasMovedEnough = true;

    handleSelectionModeMouseUp(state, options);

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

    handleSelectionModeMouseUp(state, options);

    expect(state.skipNextClick).toBe(true);
    expect(state.isDragging).toBe(false);
    expect(state.isResizing).toBe(false);
    expect(state.resizeDirection).toBeNull();
    expect(state.mouseDownPoint).toBeNull();
    expect(state.hasMovedEnough).toBe(false);
  });
}

describe('selection-mode pointer events', () => {
  registerHideHoverTest();
  registerThresholdDragTest();
  registerConfirmedMotionTest();
  registerDragFinalizeTest();
  registerSkipNextClickTest();
});
