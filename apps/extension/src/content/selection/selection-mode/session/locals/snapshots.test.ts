// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createSelectionModeMutableLocalsSnapshot,
  createSelectionModeStateSyncLocals,
} from './snapshots';
import { createSelectionModeDom } from '../../ui';

function createSnapshotArgs() {
  return {
    aspectRatio: 16 / 9,
    cleanupEventListeners: vi.fn(),
    cleanupScrollListeners: vi.fn(),
    currentSelection: { x: 10, y: 20, width: 300, height: 160 },
    currentState: 'drag' as const,
    dom: createSelectionModeDom(),
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 5,
    hasMovedEnough: true,
    hoveredElement: document.createElement('button'),
    isActive: true,
    isDragging: true,
    isResizing: false,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 },
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
    resizeDirection: 'se' as const,
    selectionAtDragStart: { x: 5, y: 6, width: 70, height: 80 },
    skipNextClick: true,
  };
}

describe('selection-mode session-local snapshots', () => {
  it('builds the mutable-locals snapshot without dropping any runtime fields', () => {
    const args = createSnapshotArgs();

    expect(createSelectionModeMutableLocalsSnapshot(args)).toEqual({
      aspectRatio: args.aspectRatio,
      cleanupEventListeners: args.cleanupEventListeners,
      cleanupScrollListeners: args.cleanupScrollListeners,
      currentSelection: args.currentSelection,
      currentState: args.currentState,
      dom: args.dom,
      dragStartPoint: args.dragStartPoint,
      dragThreshold: args.dragThreshold,
      hasMovedEnough: args.hasMovedEnough,
      hoveredElement: args.hoveredElement,
      isActive: args.isActive,
      isDragging: args.isDragging,
      isResizing: args.isResizing,
      maintainAspectRatio: args.maintainAspectRatio,
      mouseDownPoint: args.mouseDownPoint,
      resizeDirection: args.resizeDirection,
      selectionAtDragStart: args.selectionAtDragStart,
      skipNextClick: args.skipNextClick,
    });
  });

  it('builds the state-sync locals snapshot including resolve and reject callbacks', () => {
    const args = createSnapshotArgs();

    expect(createSelectionModeStateSyncLocals(args)).toEqual(args);
  });
});
