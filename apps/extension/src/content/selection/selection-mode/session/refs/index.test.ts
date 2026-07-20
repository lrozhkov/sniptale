// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeMutableRefs } from '.';
import { createSelectionModeMutableLocalsSnapshot } from '../locals-contract';
import { createSelectionModeState } from '../state';

function createMutableLocals() {
  return createSelectionModeMutableLocalsSnapshot({
    ...createSelectionModeState(),
    aspectRatio: 16 / 9,
    currentSelection: { x: 10, y: 20, width: 30, height: 40 },
    currentState: 'confirmed',
    dragStartPoint: { x: 1, y: 2 },
    dragThreshold: 9,
    hasMovedEnough: true,
    hoveredElement: document.createElement('button'),
    isActive: true,
    isDragging: true,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 3, y: 4 },
    resizeDirection: 'se',
    selectionAtDragStart: { x: 5, y: 6, width: 70, height: 80 },
    skipNextClick: true,
  });
}

function createSetter<Key extends keyof ReturnType<typeof createMutableLocals>>(
  locals: ReturnType<typeof createMutableLocals>,
  key: Key
) {
  return (value: ReturnType<typeof createMutableLocals>[Key]) => {
    locals[key] = value;
  };
}

function createMutableRefArgs(locals: ReturnType<typeof createMutableLocals>) {
  const setCurrentState = vi.fn(createSetter(locals, 'currentState'));
  const setIsDragging = vi.fn(createSetter(locals, 'isDragging'));
  const setMouseDownPoint = vi.fn(createSetter(locals, 'mouseDownPoint'));

  return {
    args: {
      getLocals: () => locals,
      setAspectRatio: createSetter(locals, 'aspectRatio'),
      setCleanupEventListeners: createSetter(locals, 'cleanupEventListeners'),
      setCleanupScrollListeners: createSetter(locals, 'cleanupScrollListeners'),
      setCurrentSelection: createSetter(locals, 'currentSelection'),
      setCurrentState,
      setDom: createSetter(locals, 'dom'),
      setDragStartPoint: createSetter(locals, 'dragStartPoint'),
      setDragThreshold: createSetter(locals, 'dragThreshold'),
      setHasMovedEnough: createSetter(locals, 'hasMovedEnough'),
      setHoveredElement: createSetter(locals, 'hoveredElement'),
      setIsActive: createSetter(locals, 'isActive'),
      setIsDragging,
      setIsResizing: createSetter(locals, 'isResizing'),
      setMaintainAspectRatio: createSetter(locals, 'maintainAspectRatio'),
      setMouseDownPoint,
      setResizeDirection: createSetter(locals, 'resizeDirection'),
      setSelectionAtDragStart: createSetter(locals, 'selectionAtDragStart'),
      setSkipNextClick: createSetter(locals, 'skipNextClick'),
    },
    setCurrentState,
    setIsDragging,
    setMouseDownPoint,
  };
}

describe('selection-mode mutable refs', () => {
  it('wires readers and setters through the shared mutable locals contract', () => {
    const locals = createMutableLocals();
    const { args, setCurrentState, setIsDragging, setMouseDownPoint } =
      createMutableRefArgs(locals);
    const refs = createSelectionModeMutableRefs(args);

    expect(refs.currentState).toBe('confirmed');
    expect(refs.currentSelection).toEqual({ x: 10, y: 20, width: 30, height: 40 });

    refs.currentState = 'drag';
    refs.isDragging = false;
    refs.mouseDownPoint = null;

    expect(setCurrentState).toHaveBeenCalledWith('drag');
    expect(setIsDragging).toHaveBeenCalledWith(false);
    expect(setMouseDownPoint).toHaveBeenCalledWith(null);
    expect(locals.currentState).toBe('drag');
    expect(locals.isDragging).toBe(false);
    expect(locals.mouseDownPoint).toBeNull();
  });
});
