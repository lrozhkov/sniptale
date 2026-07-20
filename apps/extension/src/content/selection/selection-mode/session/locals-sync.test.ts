// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeState } from './state';
import { createSelectionModeLocalsSnapshot, type SelectionModeLocals } from './locals-contract';
import { syncLocalsFromState, syncStateFromLocals } from './locals-sync';

function createLocals(overrides: Partial<SelectionModeLocals> = {}): SelectionModeLocals {
  const state = createSelectionModeState();

  return createSelectionModeLocalsSnapshot({
    ...state,
    aspectRatio: 4 / 3,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 30, height: 40 },
    currentState: 'confirmed',
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 9,
    hasMovedEnough: true,
    hoveredElement: document.createElement('button'),
    isActive: true,
    isDragging: true,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 },
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
    resizeDirection: 'se',
    selectionAtDragStart: { x: 5, y: 6, width: 70, height: 80 },
    skipNextClick: true,
    ...overrides,
  });
}

describe('selection-mode raw locals sync', () => {
  it('copies locals into the authoritative state without replacing non-local fields', () => {
    const state = createSelectionModeState();
    const locals = createLocals();
    const cursorStyleCleanup = vi.fn();
    state.cursorStyleCleanup = cursorStyleCleanup;

    syncStateFromLocals(state, locals);

    expect(createSelectionModeLocalsSnapshot(state)).toEqual(locals);
    expect(state.cursorStyleCleanup).toBe(cursorStyleCleanup);
  });

  it('emits a stable snapshot when syncing locals out of state', () => {
    const state = createSelectionModeState();
    const locals = createLocals({
      currentState: 'drag',
      isDragging: true,
      isResizing: true,
    });

    syncStateFromLocals(state, locals);

    const onSync = vi.fn();
    syncLocalsFromState(state, onSync);

    expect(onSync).toHaveBeenCalledWith(locals);
  });
});
