import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeSelectionModeDragSelection,
  handleSelectionModeResizeMove,
  startSelectionModeDragSelection,
} from '.';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';
import { createSelectionModeDom } from '../../ui';

const originalDocument = globalThis.document;

function createRuntimeArgs(
  overrides: Partial<SelectionModeRuntimeActionsArgs> = {}
): SelectionModeRuntimeActionsArgs {
  const state = {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 0, y: 0, width: 0, height: 0 },
    currentState: 'idle',
    dom: createSelectionModeDom(),
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
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    skipNextClick: false,
  } as SelectionModeRuntimeActionsArgs['state'];

  return {
    createDragFrame: vi.fn(),
    getAbsolutePosition: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
    getMaxSelectionHeight: () => 500,
    getMaxSelectionWidth: () => 500,
    hideHoverFrame: vi.fn(),
    minSelectionSize: 10,
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    setupListenerHandlers: {
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
    },
    showFinalFrame: vi.fn(),
    showHoverFrameDom: vi.fn(),
    state,
    updateFinalFrame: vi.fn(),
    zIndexBase: 1000,
    ...overrides,
  };
}

function stubDocumentBodyStyles(): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        style: {
          userSelect: '',
          webkitUserSelect: '',
        },
      },
    },
  });
}

describe('selection-mode runtime drag', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  });

  it('starts a drag selection and stores the returned runtime state', () => {
    stubDocumentBodyStyles();
    const args = createRuntimeArgs();

    startSelectionModeDragSelection(args, 25, 40);

    expect(args.createDragFrame).toHaveBeenCalledTimes(1);
    expect(args.state.currentSelection).toEqual({ x: 25, y: 40, width: 0, height: 0 });
    expect(args.state.dragStartPoint).toEqual({ x: 25, y: 40 });
    expect(args.state.currentState).toBe('drag');
  });

  it('shows the final frame when finalizing a valid drag selection', () => {
    stubDocumentBodyStyles();
    const args = createRuntimeArgs({
      state: {
        ...createRuntimeArgs().state,
        currentSelection: { x: 10, y: 20, width: 60, height: 40 },
        currentState: 'drag',
      },
    });

    finalizeSelectionModeDragSelection(args);

    expect(args.state.currentState).toBe('confirmed');
    expect(args.state.aspectRatio).toBe(1.5);
    expect(args.state.skipNextClick).toBe(true);
    expect(args.showFinalFrame).toHaveBeenCalledTimes(1);
  });

  it('ignores resize moves until a resize direction is set', () => {
    const args = createRuntimeArgs({
      updateFinalFrame: vi.fn(),
    });

    handleSelectionModeResizeMove(args, { clientX: 100, clientY: 200 } as MouseEvent);

    expect(args.state.currentSelection).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(args.updateFinalFrame).not.toHaveBeenCalled();
  });
});
