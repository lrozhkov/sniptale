// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeMutableRefReaders } from './readers';
import type { SelectionModeMutableLocals } from './types';
import { createSelectionModeDom } from '../../ui';

function createMutableLocals(): SelectionModeMutableLocals {
  return {
    aspectRatio: 16 / 9,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 300, height: 160 },
    currentState: 'drag',
    dom: createSelectionModeDom(),
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 5,
    hasMovedEnough: false,
    hoveredElement: document.createElement('button'),
    isActive: true,
    isDragging: true,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 },
    resizeDirection: 'se',
    selectionAtDragStart: { x: 0, y: 0, width: 100, height: 50 },
    skipNextClick: false,
  };
}

function readMutableLocalsSnapshot(
  readers: ReturnType<typeof createSelectionModeMutableRefReaders>
) {
  return {
    aspectRatio: readers.getAspectRatio(),
    cleanupEventListeners: readers.getCleanupEventListeners(),
    cleanupScrollListeners: readers.getCleanupScrollListeners(),
    currentSelection: readers.getCurrentSelection(),
    currentState: readers.getCurrentState(),
    dom: readers.getDom(),
    dragStartPoint: readers.getDragStartPoint(),
    dragThreshold: readers.getDragThreshold(),
    hasMovedEnough: readers.getHasMovedEnough(),
    hoveredElement: readers.getHoveredElement(),
    isActive: readers.getIsActive(),
    isDragging: readers.getIsDragging(),
    isResizing: readers.getIsResizing(),
    maintainAspectRatio: readers.getMaintainAspectRatio(),
    mouseDownPoint: readers.getMouseDownPoint(),
    resizeDirection: readers.getResizeDirection(),
    selectionAtDragStart: readers.getSelectionAtDragStart(),
    skipNextClick: readers.getSkipNextClick(),
  };
}

describe('selection-mode mutable ref readers', () => {
  it('reads the current mutable locals through the reader adapters', () => {
    const locals = createMutableLocals();
    const readers = createSelectionModeMutableRefReaders(() => locals);

    expect(readMutableLocalsSnapshot(readers)).toEqual(locals);

    locals.aspectRatio = null;
    locals.currentState = 'confirmed';
    locals.currentSelection = { x: 40, y: 50, width: 320, height: 180 };
    locals.dragThreshold = 9;
    locals.hasMovedEnough = true;
    locals.hoveredElement = null;
    locals.isDragging = false;
    locals.isResizing = true;
    locals.maintainAspectRatio = false;
    locals.mouseDownPoint = null;
    locals.resizeDirection = 'nw';
    locals.skipNextClick = true;

    expect(readMutableLocalsSnapshot(readers)).toEqual(locals);
  });
});
