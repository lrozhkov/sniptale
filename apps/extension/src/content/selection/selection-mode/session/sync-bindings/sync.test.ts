import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeDom } from '../../ui';
import { syncSelectionModeLocalsFromState, syncSelectionModeStateFromLocals } from '.';
import type { SelectionModeMutableRefs } from '../locals-contract';
import { createSelectionModeState } from '../state';

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

function createConfirmedLocals(nextDom: ReturnType<typeof createSelectionModeDom>) {
  return {
    aspectRatio: 1.2,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 10, y: 20, width: 30, height: 40 },
    currentState: 'confirmed' as const,
    dom: nextDom,
    dragStartPoint: { x: 5, y: 6 },
    dragThreshold: 9,
    hasMovedEnough: true,
    hoveredElement: null,
    isActive: true,
    isDragging: false,
    isResizing: true,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 7, y: 8 },
    rejectCallback: null,
    resolveCallback: null,
    resizeDirection: 'se' as const,
    selectionAtDragStart: { x: 1, y: 2, width: 3, height: 4 },
    skipNextClick: true,
  };
}

describe('selection-mode shell sync', () => {
  it('syncs locals into state without mutating the mutable refs proxy', () => {
    const state = createSelectionModeState();
    const mutableRefs = createMutableRefs();
    const nextDom = createSelectionModeDom();

    syncSelectionModeStateFromLocals({
      state,
      mutableRefs,
      locals: createConfirmedLocals(nextDom),
    });

    expect(state.currentState).toBe('confirmed');
    expect(state.currentSelection).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(state.dom).toBe(nextDom);
    expect(mutableRefs.currentState).toBe('idle');
  });

  it('syncs state back into mutable refs and emits the locals snapshot', () => {
    const state = createSelectionModeState();
    const mutableRefs = createMutableRefs();
    const onSync = vi.fn();
    state.currentState = 'drag';
    state.currentSelection = { x: 11, y: 22, width: 33, height: 44 };
    state.isDragging = true;

    syncSelectionModeLocalsFromState({
      state,
      mutableRefs,
      onSync,
    });

    expect(mutableRefs.currentState).toBe('drag');
    expect(mutableRefs.currentSelection).toEqual({ x: 11, y: 22, width: 33, height: 44 });
    expect(mutableRefs.isDragging).toBe(true);
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({ currentState: 'drag' }));
  });
});
