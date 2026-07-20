import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeDom } from '../../ui';
import {
  createSelectionModeSessionMutableRefs,
  createSelectionModeStateSyncLocals,
  type SelectionModeSession,
} from './helpers';

function createSessionState(): SelectionModeSession {
  return {
    aspectRatio: null,
    cleanupEventListeners: null,
    cleanupScrollListeners: null,
    currentSelection: { x: 0, y: 0, width: 20, height: 30 },
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
    rejectCallback: vi.fn(),
    resolveCallback: vi.fn(),
    resizeDirection: null,
    selectionAtDragStart: { x: 0, y: 0, width: 20, height: 30 },
    skipNextClick: false,
  };
}

describe('selection-mode session locals helpers', () => {
  it('keeps mutable refs wired to the backing session object', () => {
    const session = createSessionState();
    const refs = createSelectionModeSessionMutableRefs(session);

    expect(refs.currentSelection).toEqual({ x: 0, y: 0, width: 20, height: 30 });
    expect(refs.isActive).toBe(false);

    refs.currentSelection = { x: 10, y: 15, width: 80, height: 90 };
    refs.isActive = true;
    refs.dragThreshold = 12;

    expect(session.currentSelection).toEqual({ x: 10, y: 15, width: 80, height: 90 });
    expect(session.isActive).toBe(true);
    expect(session.dragThreshold).toBe(12);
  });

  it('builds sync locals without dropping resolve or reject callbacks', () => {
    const session = createSessionState();

    const locals = createSelectionModeStateSyncLocals(session);

    expect(locals.resolveCallback).toBe(session.resolveCallback);
    expect(locals.rejectCallback).toBe(session.rejectCallback);
    expect(locals.currentSelection).toEqual(session.currentSelection);
  });
});
