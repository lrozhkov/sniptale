import { describe, expect, it } from 'vitest';

import { createMutableRefs } from './test-support';
import { createSelectionModeCoreState } from './core';

describe('selection-mode runtime-state core slice', () => {
  it('reads and writes the core fields through the mutable refs proxy', () => {
    const refs = createMutableRefs();
    const state = createSelectionModeCoreState(refs);

    refs.aspectRatio = 16 / 9;
    refs.cleanupEventListeners = () => undefined;
    refs.cleanupScrollListeners = () => undefined;
    refs.currentSelection = { x: 11, y: 12, width: 130, height: 140 };
    refs.currentState = 'hover';
    refs.dom = createMutableRefs().dom;
    refs.dragThreshold = 15;

    expect(state.aspectRatio).toBe(16 / 9);
    expect(state.cleanupEventListeners).toEqual(expect.any(Function));
    expect(state.cleanupScrollListeners).toEqual(expect.any(Function));
    expect(state.currentSelection).toEqual({ x: 11, y: 12, width: 130, height: 140 });
    expect(state.currentState).toBe('hover');
    expect(state.dom).toBe(refs.dom);
    expect(state.dragThreshold).toBe(15);

    const cleanupEventListeners = () => undefined;
    const cleanupScrollListeners = () => undefined;
    const dom = createMutableRefs().dom;

    state.aspectRatio = 4 / 3;
    state.cleanupEventListeners = cleanupEventListeners;
    state.cleanupScrollListeners = cleanupScrollListeners;
    state.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
    state.currentState = 'confirmed';
    state.dom = dom;
    state.dragThreshold = 7;

    expect(refs.aspectRatio).toBe(4 / 3);
    expect(refs.cleanupEventListeners).toBe(cleanupEventListeners);
    expect(refs.cleanupScrollListeners).toBe(cleanupScrollListeners);
    expect(refs.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(refs.currentState).toBe('confirmed');
    expect(refs.dom).toBe(dom);
    expect(refs.dragThreshold).toBe(7);
  });
});
