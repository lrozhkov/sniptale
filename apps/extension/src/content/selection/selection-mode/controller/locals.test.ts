import { describe, expect, it } from 'vitest';
import { createSelectionModeDom } from '../ui';
import { applySelectionModeLocals, createSelectionModeLocalsSnapshot } from './locals';
import type { SelectionModeMutableRefs } from '../session/locals-contract';
import type { SelectionModeLocals } from '../session/locals-sync';

function createMutableRefs(): SelectionModeMutableRefs {
  return {
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
    isActive: false,
    isDragging: false,
    isResizing: false,
    maintainAspectRatio: false,
    mouseDownPoint: null,
    resizeDirection: null,
    selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
    skipNextClick: false,
  };
}

function createSelectionModeLocals(
  overrides: Partial<SelectionModeLocals> = {}
): SelectionModeLocals {
  return createSelectionModeLocalsSnapshot({
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 10, y: 20, width: 30, height: 40 },
    currentState: 'confirmed',
    dom: createSelectionModeDom(),
    dragStartPoint: { x: 11, y: 22 },
    dragThreshold: 7,
    hasMovedEnough: true,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: true,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 5, y: 6 },
    rejectCallback: null,
    resolveCallback: null,
    resizeDirection: 'se',
    selectionAtDragStart: { x: 10, y: 20, width: 30, height: 40 },
    skipNextClick: true,
    ...overrides,
  });
}

describe('selection-mode controller locals', () => {
  it('creates a full locals snapshot for state sync', () => {
    const locals = createSelectionModeLocals({
      aspectRatio: 1.5,
    });

    expect(locals.currentState).toBe('confirmed');
    expect(locals.currentSelection).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(locals.maintainAspectRatio).toBe(true);
  });

  it('applies synced locals back into mutable refs', () => {
    const refs = createMutableRefs();

    applySelectionModeLocals(
      refs,
      createSelectionModeLocals({
        currentSelection: { x: 50, y: 60, width: 70, height: 80 },
        currentState: 'hover',
        dom: refs.dom,
        dragStartPoint: { x: 1, y: 2 },
        dragThreshold: 12,
        isResizing: false,
        maintainAspectRatio: false,
        mouseDownPoint: { x: 3, y: 4 },
        resizeDirection: 'e',
        selectionAtDragStart: { x: 9, y: 8, width: 7, height: 6 },
      })
    );

    expect(refs.currentState).toBe('hover');
    expect(refs.currentSelection).toEqual({ x: 50, y: 60, width: 70, height: 80 });
    expect(refs.dragThreshold).toBe(12);
    expect(refs.skipNextClick).toBe(true);
  });
});
