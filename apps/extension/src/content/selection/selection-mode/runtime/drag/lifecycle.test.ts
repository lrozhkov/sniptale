// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';

const { applySelectionModeDragSelectionMock, applySelectionModeElementSelectionMock } = vi.hoisted(
  () => ({
    applySelectionModeDragSelectionMock: vi.fn(),
    applySelectionModeElementSelectionMock: vi.fn(),
  })
);

vi.mock('../../interaction/actions', () => ({
  applySelectionModeDragSelection: applySelectionModeDragSelectionMock,
  applySelectionModeElementSelection: applySelectionModeElementSelectionMock,
}));

import {
  constrainSelectionModeSelection,
  handleSelectionModeDragMove,
  handleSelectionModeResizeMove,
  hideSelectionModeHoverFrame,
  resetSelectionModeToIdleState,
  selectSelectionModeElement,
  showSelectionModeHoverFrame,
  startSelectionModeDragSelection,
  updateSelectionModeDragSelection,
  updateSelectionModeFinalFrame,
  finalizeSelectionModeDragSelection,
} from '.';

function createSetupListenerHandlers() {
  return {
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  };
}

function createState() {
  return {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 10, y: 20, width: 30, height: 40 },
    currentState: 'idle',
    dom: {
      overlayContainer: null,
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
    },
    dragStartPoint: { x: 3, y: 4 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    resizeDirection: null,
    selectionAtDragStart: { x: 10, y: 20, width: 30, height: 40 },
    skipNextClick: false,
  } as SelectionModeRuntimeActionsArgs['state'];
}

function createArgs(
  overrides: Partial<SelectionModeRuntimeActionsArgs> = {}
): SelectionModeRuntimeActionsArgs {
  return {
    createDragFrame: vi.fn(),
    getAbsolutePosition: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
    getMaxSelectionHeight: vi.fn(() => 500),
    getMaxSelectionWidth: vi.fn(() => 800),
    hideHoverFrame: vi.fn(),
    minSelectionSize: 20,
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    setupListenerHandlers: createSetupListenerHandlers(),
    showFinalFrame: vi.fn(),
    showHoverFrameDom: vi.fn(),
    state: createState(),
    updateFinalFrame: vi.fn(),
    zIndexBase: 900,
    ...overrides,
  };
}

function createDragRuntime() {
  return {
    constrainSelection: vi.fn(() => ({ x: 0, y: 0, width: 60, height: 50 })),
    finalizeDragSelection: vi.fn(() => ({
      aspectRatio: 1.5,
      currentState: 'confirmed',
      shouldShowFinalFrame: true,
      skipNextClick: true,
    })),
    handleDragMove: vi.fn(() => ({ x: 40, y: 30, width: 60, height: 50 })),
    handleResizeMove: vi.fn(() => ({ x: 45, y: 35, width: 70, height: 60 })),
    resetToIdleState: vi.fn(() => ({
      aspectRatio: null,
      currentSelection: { x: 0, y: 0, width: 0, height: 0 },
      currentState: 'idle',
      hasMovedEnough: false,
      hoveredElement: null,
      isDragging: false,
      isResizing: false,
      maintainAspectRatio: false,
      mouseDownPoint: null,
      resizeDirection: null,
    })),
    startDragSelection: vi.fn(() => ({
      currentSelection: { x: 100, y: 120, width: 0, height: 0 },
      currentState: 'drag',
      dragStartPoint: { x: 100, y: 120 },
    })),
    updateDragFrame: vi.fn(),
    updateDragSelection: vi.fn(() => ({ x: 100, y: 120, width: 80, height: 40 })),
    updateFinalFrame: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function createResizingArgs() {
  return createArgs({
    state: {
      ...createState(),
      isDragging: true,
      isResizing: true,
      resizeDirection: 'se',
    },
  });
}

function registerHoverLifecycleTest() {
  it('updates hover visibility state through the runtime wrapper', () => {
    const args = createArgs();
    const element = document.createElement('div');

    showSelectionModeHoverFrame(args, element);
    hideSelectionModeHoverFrame(args);

    expect(args.showHoverFrameDom).toHaveBeenCalledWith(element);
    expect(args.hideHoverFrame).toHaveBeenCalledTimes(1);
    expect(args.state.currentState).toBe('idle');
  });
}

function registerElementSelectionTest() {
  it('applies element selection results and shows the final frame', () => {
    const args = createArgs();
    const element = document.createElement('article');
    applySelectionModeElementSelectionMock.mockReturnValue({
      aspectRatio: 2,
      currentSelection: { x: 15, y: 25, width: 160, height: 80 },
    });

    selectSelectionModeElement(args, element);

    expect(args.state.currentSelection).toEqual({ x: 15, y: 25, width: 160, height: 80 });
    expect(args.state.aspectRatio).toBe(2);
    expect(args.hideHoverFrame).toHaveBeenCalledTimes(1);
    expect(args.showFinalFrame).toHaveBeenCalledTimes(1);
  });
}

function registerDragResultTest() {
  it('stores start, update, finalize, and constrain runtime results', () => {
    const args = createArgs();
    const dragRuntime = createDragRuntime();
    applySelectionModeDragSelectionMock.mockReturnValue(dragRuntime);

    startSelectionModeDragSelection(args, 100, 120);
    updateSelectionModeDragSelection(args, 180, 160);
    finalizeSelectionModeDragSelection(args);
    constrainSelectionModeSelection(args);

    expect(args.state.dragStartPoint).toEqual({ x: 100, y: 120 });
    expect(args.state.currentSelection).toEqual({ x: 0, y: 0, width: 60, height: 50 });
    expect(args.state.currentState).toBe('confirmed');
    expect(args.state.aspectRatio).toBe(1.5);
    expect(args.state.skipNextClick).toBe(true);
    expect(args.showFinalFrame).toHaveBeenCalledTimes(1);
    expect(dragRuntime.updateDragFrame).toHaveBeenCalledTimes(1);
  });
}

function registerRuntimeFlowTest() {
  it('applies reset, drag-move, resize-move, and final-frame update flows', () => {
    const args = createResizingArgs();
    const dragRuntime = createDragRuntime();
    applySelectionModeDragSelectionMock.mockReturnValue(dragRuntime);

    resetSelectionModeToIdleState(args);
    handleSelectionModeDragMove(args, { clientX: 200, clientY: 180 } as MouseEvent);
    args.state.resizeDirection = 'se';
    handleSelectionModeResizeMove(args, { clientX: 220, clientY: 210 } as MouseEvent);
    updateSelectionModeFinalFrame(args);

    expect(args.state.currentSelection).toEqual({ x: 0, y: 0, width: 60, height: 50 });
    expect(args.state.currentState).toBe('idle');
    expect(args.updateFinalFrame).toHaveBeenCalledTimes(2);
    expect(dragRuntime.updateFinalFrame).toHaveBeenCalledTimes(1);
    expect(dragRuntime.handleDragMove).toHaveBeenCalledTimes(1);
    expect(dragRuntime.handleResizeMove).toHaveBeenCalledTimes(1);
  });
}

describe('selection-mode runtime drag lifecycle', () => {
  registerHoverLifecycleTest();
  registerElementSelectionTest();
  registerDragResultTest();
  registerRuntimeFlowTest();
});
