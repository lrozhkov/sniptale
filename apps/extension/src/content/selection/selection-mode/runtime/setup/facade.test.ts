// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResizeDirection, SelectionModeDom } from '../../ui/dom-types';
import type { Point, Selection, SelectionState } from '../../types';

const { createSelectionModeRuntimeArgsMock } = vi.hoisted(() => ({
  createSelectionModeRuntimeArgsMock: vi.fn(),
}));

vi.mock('../../session/runtime-state/args', () => ({
  createSelectionModeRuntimeArgs: createSelectionModeRuntimeArgsMock,
}));

import { createSelectionModeMutableRefs, createSelectionModeRuntimeSetup } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

interface MutableRefState {
  aspectRatio: number | null;
  cleanupEventListeners: (() => void) | null;
  cleanupScrollListeners: (() => void) | null;
  currentSelection: Selection;
  currentState: SelectionState;
  dom: SelectionModeDom;
  dragStartPoint: Point;
  dragThreshold: number;
  hasMovedEnough: boolean;
  hoveredElement: HTMLElement | null;
  isActive: boolean;
  isDragging: boolean;
  isResizing: boolean;
  maintainAspectRatio: boolean;
  mouseDownPoint: Point | null;
  resizeDirection: ResizeDirection | null;
  selectionAtDragStart: Selection;
  skipNextClick: boolean;
}

function createMutableRefState(): MutableRefState {
  const dom: SelectionModeDom = {
    overlayContainer: document.createElement('div'),
    hoverFrame: null,
    scissorsIcon: null,
    hoverSizeLabel: null,
    dragFrame: null,
    finalFrame: null,
    finalOverlay: null,
    sizePanel: null,
    sizeTooltip: null,
    widthInput: null,
    heightInput: null,
    aspectRatioButton: null,
    cancelButton: null,
    dragEventCatcher: null,
  };

  return {
    aspectRatio: 2 as number | null,
    cleanupEventListeners: null as (() => void) | null,
    cleanupScrollListeners: null as (() => void) | null,
    currentSelection: { x: 10, y: 20, width: 300, height: 160 },
    currentState: 'idle' as SelectionState,
    dom,
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: document.createElement('section') as HTMLElement | null,
    isActive: true,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 } as { x: number; y: number } | null,
    resizeDirection: 'se' as 'se' | null,
    selectionAtDragStart: { x: 0, y: 0, width: 100, height: 50 },
    skipNextClick: false,
  };
}

function createMutableRefGetterArgs(state: ReturnType<typeof createMutableRefState>) {
  return {
    getAspectRatio: () => state.aspectRatio,
    getCleanupEventListeners: () => state.cleanupEventListeners,
    getCleanupScrollListeners: () => state.cleanupScrollListeners,
    getCurrentSelection: () => state.currentSelection,
    getCurrentState: () => state.currentState,
    getDom: () => state.dom,
    getDragStartPoint: () => state.dragStartPoint,
    getDragThreshold: () => state.dragThreshold,
    getHasMovedEnough: () => state.hasMovedEnough,
    getHoveredElement: () => state.hoveredElement,
    getIsActive: () => state.isActive,
    getIsDragging: () => state.isDragging,
    getIsResizing: () => state.isResizing,
    getMaintainAspectRatio: () => state.maintainAspectRatio,
    getMouseDownPoint: () => state.mouseDownPoint,
    getResizeDirection: () => state.resizeDirection,
    getSelectionAtDragStart: () => state.selectionAtDragStart,
    getSkipNextClick: () => state.skipNextClick,
  };
}

function createMutableRefSetterArgs(state: ReturnType<typeof createMutableRefState>) {
  return {
    setAspectRatio: (value: number | null) => {
      state.aspectRatio = value;
    },
    setCleanupEventListeners: (value: (() => void) | null) => {
      state.cleanupEventListeners = value;
    },
    setCleanupScrollListeners: (value: (() => void) | null) => {
      state.cleanupScrollListeners = value;
    },
    setCurrentSelection: (value: typeof state.currentSelection) => {
      state.currentSelection = value;
    },
    setCurrentState: (value: typeof state.currentState) => {
      state.currentState = value;
    },
    setDom: (value: typeof state.dom) => {
      state.dom = value;
    },
    ...createMutableRefInteractionSetterArgs(state),
  };
}

function createMutableRefInteractionSetterArgs(state: ReturnType<typeof createMutableRefState>) {
  return {
    setDragStartPoint: (value: typeof state.dragStartPoint) => {
      state.dragStartPoint = value;
    },
    setDragThreshold: (value: number) => {
      state.dragThreshold = value;
    },
    setHasMovedEnough: (value: boolean) => {
      state.hasMovedEnough = value;
    },
    setHoveredElement: (value: HTMLElement | null) => {
      state.hoveredElement = value;
    },
    setIsActive: (value: boolean) => {
      state.isActive = value;
    },
    setIsDragging: (value: boolean) => {
      state.isDragging = value;
    },
    setIsResizing: (value: boolean) => {
      state.isResizing = value;
    },
    setMaintainAspectRatio: (value: boolean) => {
      state.maintainAspectRatio = value;
    },
    setMouseDownPoint: (value: typeof state.mouseDownPoint) => {
      state.mouseDownPoint = value;
    },
    setResizeDirection: (value: typeof state.resizeDirection) => {
      state.resizeDirection = value;
    },
    setSelectionAtDragStart: (value: typeof state.selectionAtDragStart) => {
      state.selectionAtDragStart = value;
    },
    setSkipNextClick: (value: boolean) => {
      state.skipNextClick = value;
    },
  };
}

function createMutableRefArgs() {
  const state = createMutableRefState();
  return {
    ...createMutableRefGetterArgs(state),
    ...createMutableRefSetterArgs(state),
  };
}

describe('selection-mode mutable refs', () => {
  it('exposes live getter/setter bindings for the runtime owner state', () => {
    const refs = createSelectionModeMutableRefs(createMutableRefArgs());
    const cleanup = vi.fn();
    const nextSelection = { x: 40, y: 50, width: 320, height: 180 };

    expect(refs.aspectRatio).toBe(2);
    expect(refs.currentSelection).toEqual({ x: 10, y: 20, width: 300, height: 160 });
    expect(refs.currentState).toBe('idle');
    expect(refs.dragThreshold).toBe(5);
    expect(refs.resizeDirection).toBe('se');

    refs.aspectRatio = null;
    refs.cleanupEventListeners = cleanup;
    refs.currentSelection = nextSelection;
    refs.currentState = 'hover';
    refs.dragThreshold = 9;
    refs.skipNextClick = true;

    expect(refs.aspectRatio).toBeNull();
    expect(refs.cleanupEventListeners).toBe(cleanup);
    expect(refs.currentSelection).toEqual(nextSelection);
    expect(refs.currentState).toBe('hover');
    expect(refs.dragThreshold).toBe(9);
    expect(refs.skipNextClick).toBe(true);
  });
});

describe('selection-mode runtime setup', () => {
  it('creates runtime args and promotes the mutable refs state to confirmed when showing the final frame', () => {
    const mutableRefs = { currentState: 'drag' };
    const createDragFrame = vi.fn();
    const createFinalElements = vi.fn();
    const updateFinalFrame = vi.fn();
    createSelectionModeRuntimeArgsMock.mockImplementation((args) => args);

    const runtimeArgs = createSelectionModeRuntimeSetup({
      createDragFrame,
      createFinalElements,
      getMaxSelectionHeight: vi.fn(() => 800),
      getMaxSelectionWidth: vi.fn(() => 1200),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
      minSelectionSize: 100,
      mutableRefs: mutableRefs as never,
      setCleanupEventListeners: vi.fn(),
      setCleanupScrollListeners: vi.fn(),
      updateFinalFrame,
      zIndexBase: 700,
    });

    runtimeArgs.showFinalFrame();

    expect(createSelectionModeRuntimeArgsMock).toHaveBeenCalledTimes(1);
    expect(createDragFrame).not.toHaveBeenCalled();
    expect(createFinalElements).toHaveBeenCalledTimes(1);
    expect(updateFinalFrame).toHaveBeenCalledTimes(1);
    expect(mutableRefs.currentState).toBe('confirmed');
  });
});
