// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  applySelectionModeMutableLocals,
  applySelectionModeStateLocals,
  createSelectionModeLocalsSnapshot,
  createSelectionModeMutableLocalsSnapshot,
} from './locals-contract';
import { createSelectionModeState } from './state';

function createLocalsFixture() {
  return {
    aspectRatio: 16 / 9,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 300, height: 200 },
    currentState: 'confirmed' as const,
    dom: createSelectionModeState().dom,
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 7,
    hasMovedEnough: true,
    hoveredElement: document.createElement('button'),
    isActive: true,
    isDragging: true,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 5, y: 6 },
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
    resizeDirection: 'se' as const,
    selectionAtDragStart: { x: 11, y: 22, width: 33, height: 44 },
    skipNextClick: true,
  };
}

describe('selection-mode locals snapshots', () => {
  it('creates the full locals snapshot including promise callbacks', () => {
    const locals = createLocalsFixture();

    expect(createSelectionModeLocalsSnapshot(locals)).toEqual(locals);
  });

  it('creates the mutable locals snapshot without promise callbacks', () => {
    const locals = createLocalsFixture();

    expect(createSelectionModeMutableLocalsSnapshot(locals)).toEqual({
      aspectRatio: locals.aspectRatio,
      cleanupEventListeners: locals.cleanupEventListeners,
      cleanupScrollListeners: locals.cleanupScrollListeners,
      currentSelection: locals.currentSelection,
      currentState: locals.currentState,
      dom: locals.dom,
      dragStartPoint: locals.dragStartPoint,
      dragThreshold: locals.dragThreshold,
      hasMovedEnough: locals.hasMovedEnough,
      hoveredElement: locals.hoveredElement,
      isActive: locals.isActive,
      isDragging: locals.isDragging,
      isResizing: locals.isResizing,
      maintainAspectRatio: locals.maintainAspectRatio,
      mouseDownPoint: locals.mouseDownPoint,
      resizeDirection: locals.resizeDirection,
      selectionAtDragStart: locals.selectionAtDragStart,
      skipNextClick: locals.skipNextClick,
    });
  });
});

describe('selection-mode locals application', () => {
  it('applies full locals to state without touching non-local fields', () => {
    const state = createSelectionModeState();
    const locals = createLocalsFixture();
    const cursorStyleCleanup = vi.fn();
    state.cursorStyleCleanup = cursorStyleCleanup;

    applySelectionModeStateLocals(state, locals);

    expect(createSelectionModeLocalsSnapshot(state)).toEqual(locals);
    expect(state.cursorStyleCleanup).toBe(cursorStyleCleanup);
  });

  it('applies mutable locals to mutable refs without adding promise callbacks', () => {
    const locals = createLocalsFixture();
    const refs = createSelectionModeMutableLocalsSnapshot(createSelectionModeState());

    applySelectionModeMutableLocals(refs, locals);

    expect(refs).toEqual(createSelectionModeMutableLocalsSnapshot(locals));
    expect('resolveCallback' in refs).toBe(false);
    expect('rejectCallback' in refs).toBe(false);
  });
});
