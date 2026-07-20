// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createSelectionModeSessionMutableRefs } from './locals/helpers';
import { createSelectionModeSession, resetSelectionModeSession } from '.';
import { syncSelectionModeSessionFromState, syncSelectionModeSessionToState } from './sync';
import { createSelectionModeState } from './state';

describe('selection-mode session bootstrap', () => {
  it('creates and resets the mutable session locals', () => {
    const state = createSelectionModeState();
    state.aspectRatio = 16 / 9;
    state.cleanupEventListeners = () => {};
    state.cleanupScrollListeners = () => {};
    state.currentSelection = { x: 10, y: 20, width: 300, height: 200 };
    state.currentState = 'confirmed';
    state.isActive = true;
    state.isDragging = true;
    state.maintainAspectRatio = true;
    state.rejectCallback = () => {};
    state.resolveCallback = () => {};

    const session = createSelectionModeSession(state);

    expect(session.aspectRatio).toBe(16 / 9);
    expect(session.currentSelection).toEqual({ x: 10, y: 20, width: 300, height: 200 });
    expect(session.currentState).toBe('confirmed');
    expect(session.isActive).toBe(true);
    expect(session.isDragging).toBe(true);
    expect(session.maintainAspectRatio).toBe(true);

    resetSelectionModeSession(session);

    expect(session.aspectRatio).toBeNull();
    expect(session.cleanupEventListeners).toBeNull();
    expect(session.cleanupScrollListeners).toBeNull();
    expect(session.currentSelection).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(session.currentState).toBe('idle');
    expect(session.isActive).toBe(false);
    expect(session.isDragging).toBe(false);
    expect(session.maintainAspectRatio).toBe(false);
    expect(session.rejectCallback).toBeNull();
    expect(session.resolveCallback).toBeNull();
  });
});

describe('selection-mode session sync', () => {
  it('syncs the mutable session locals with state in both directions', () => {
    const state = createSelectionModeState();
    const session = createSelectionModeSession(state);
    const mutableRefs = createSelectionModeSessionMutableRefs(session);

    session.aspectRatio = 4 / 3;
    session.currentSelection = { x: 40, y: 30, width: 120, height: 90 };
    session.currentState = 'drag';
    session.isActive = true;
    session.isDragging = true;
    session.isResizing = true;
    session.hasMovedEnough = true;
    session.maintainAspectRatio = true;

    syncSelectionModeSessionToState(session, mutableRefs, state);

    expect(state.aspectRatio).toBe(4 / 3);
    expect(state.currentSelection).toEqual({ x: 40, y: 30, width: 120, height: 90 });
    expect(state.currentState).toBe('drag');
    expect(state.isActive).toBe(true);
    expect(state.isDragging).toBe(true);
    expect(state.isResizing).toBe(true);
    expect(state.hasMovedEnough).toBe(true);
    expect(state.maintainAspectRatio).toBe(true);

    state.aspectRatio = 1;
    state.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
    state.currentState = 'idle';
    state.isActive = false;
    state.isDragging = false;
    state.isResizing = false;
    state.hasMovedEnough = false;
    state.maintainAspectRatio = false;

    syncSelectionModeSessionFromState(session, mutableRefs, state);

    expect(session.aspectRatio).toBe(1);
    expect(session.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(session.currentState).toBe('idle');
    expect(session.isActive).toBe(false);
    expect(session.isDragging).toBe(false);
    expect(session.isResizing).toBe(false);
    expect(session.hasMovedEnough).toBe(false);
    expect(session.maintainAspectRatio).toBe(false);
  });
});
