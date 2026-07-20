import { describe, expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModePointerState } from '.';
import { createSelectionModeDom } from '../../ui';

describe('selection-mode runtime-state pointer slice', () => {
  it('composes the pointer fields through the mutable refs proxy', () => {
    const refs = createMutableRefs();
    const state = createSelectionModePointerState(refs);

    expect(refs.dom).toEqual(createSelectionModeDom());
    refs.dragStartPoint = { x: 13, y: 14 };
    refs.hasMovedEnough = true;
    const initialHoveredElement = {} as HTMLElement;
    refs.hoveredElement = initialHoveredElement;
    refs.isActive = true;
    refs.mouseDownPoint = { x: 16, y: 17 };
    refs.resizeDirection = 'se';
    refs.selectionAtDragStart = { x: 18, y: 19, width: 150, height: 160 };

    expect(state.dragStartPoint).toEqual({ x: 13, y: 14 });
    expect(state.hasMovedEnough).toBe(true);
    expect(state.hoveredElement).toBe(initialHoveredElement);
    expect(state.isActive).toBe(true);
    expect(state.mouseDownPoint).toEqual({ x: 16, y: 17 });
    expect(state.resizeDirection).toBe('se');
    expect(state.selectionAtDragStart).toEqual({ x: 18, y: 19, width: 150, height: 160 });

    state.dragStartPoint = { x: 5, y: 6 };
    state.hasMovedEnough = false;
    const updatedHoveredElement = {} as HTMLElement;
    state.hoveredElement = updatedHoveredElement;
    state.isActive = false;
    state.mouseDownPoint = { x: 8, y: 9 };
    state.resizeDirection = 'nw';
    state.selectionAtDragStart = { x: 10, y: 11, width: 12, height: 13 };

    expect(refs.dragStartPoint).toEqual({ x: 5, y: 6 });
    expect(refs.hasMovedEnough).toBe(false);
    expect(refs.hoveredElement).toBe(updatedHoveredElement);
    expect(refs.isActive).toBe(false);
    expect(refs.mouseDownPoint).toEqual({ x: 8, y: 9 });
    expect(refs.resizeDirection).toBe('nw');
    expect(refs.selectionAtDragStart).toEqual({ x: 10, y: 11, width: 12, height: 13 });
  });
});
