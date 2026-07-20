// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  applySelectionModeMutableLocals as applySelectionModeLocals,
  createSelectionModeLocalsSnapshot,
} from './locals-contract';
import { createSelectionModeMutableLocalsSnapshot } from './locals/snapshots';
import {
  createSelectionModeSessionMutableRefs,
  createSelectionModeStateSyncLocals,
} from './locals/helpers';
import { createSelectionModeState } from './state';
import { createSelectionModeSession, resetSelectionModeSession } from '.';
import { syncSelectionModeSessionFromState, syncSelectionModeSessionToState } from './sync';

function createStateFixture() {
  const state = createSelectionModeState();
  state.aspectRatio = 16 / 9;
  state.cleanupEventListeners = vi.fn();
  state.cleanupScrollListeners = vi.fn();
  state.currentSelection = { x: 10, y: 20, width: 300, height: 200 };
  state.currentState = 'confirmed';
  state.dragStartPoint = { x: 1, y: 2 };
  state.dragThreshold = 9;
  state.hasMovedEnough = true;
  state.hoveredElement = document.createElement('button');
  state.isActive = true;
  state.isDragging = true;
  state.isResizing = false;
  state.maintainAspectRatio = true;
  state.mouseDownPoint = { x: 3, y: 4 };
  state.rejectCallback = vi.fn();
  state.resolveCallback = vi.fn();
  state.resizeDirection = 'se';
  state.selectionAtDragStart = { x: 5, y: 6, width: 70, height: 80 };
  state.skipNextClick = true;

  return state;
}

function expectSessionSnapshotsToMatchState(
  session: ReturnType<typeof createSelectionModeSession>,
  state: ReturnType<typeof createStateFixture>
) {
  expect(createSelectionModeStateSyncLocals(session)).toEqual(
    createSelectionModeLocalsSnapshot(state)
  );
  expect(createSelectionModeMutableLocalsSnapshot(session)).toEqual(
    createSelectionModeMutableLocalsSnapshot(state)
  );
}

function syncSessionIntoState(
  session: ReturnType<typeof createSelectionModeSession>,
  mutableRefs: ReturnType<typeof createSelectionModeSessionMutableRefs>,
  state: ReturnType<typeof createStateFixture>
) {
  mutableRefs.currentState = 'drag';
  mutableRefs.currentSelection = { x: 40, y: 50, width: 60, height: 70 };
  mutableRefs.isResizing = true;

  syncSelectionModeSessionToState(session, mutableRefs, state);
}

function syncStateBackIntoSession(
  session: ReturnType<typeof createSelectionModeSession>,
  mutableRefs: ReturnType<typeof createSelectionModeSessionMutableRefs>,
  state: ReturnType<typeof createStateFixture>
) {
  state.currentState = 'idle';
  state.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
  state.isDragging = false;

  syncSelectionModeSessionFromState(session, mutableRefs, state);
}

describe('selection-mode session flow sync', () => {
  it('keeps the session, mutable refs, and state snapshots aligned through the canonical contract', () => {
    const state = createStateFixture();
    const session = createSelectionModeSession(state);
    const mutableRefs = createSelectionModeSessionMutableRefs(session);

    expectSessionSnapshotsToMatchState(session, state);
    syncSessionIntoState(session, mutableRefs, state);

    expect(state.currentState).toBe('drag');
    expect(state.currentSelection).toEqual({ x: 40, y: 50, width: 60, height: 70 });
    expect(state.isResizing).toBe(true);

    syncStateBackIntoSession(session, mutableRefs, state);

    expect(session.currentState).toBe('idle');
    expect(session.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(mutableRefs.currentState).toBe('idle');
    expect(mutableRefs.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('selection-mode session flow locals', () => {
  it('applies controller locals into session-backed refs without leaking promise callbacks', () => {
    const session = createSelectionModeSession(createStateFixture());
    const mutableRefs = createSelectionModeSessionMutableRefs(session);
    const nextLocals = createSelectionModeStateSyncLocals({
      ...session,
      currentState: 'hover',
      currentSelection: { x: 8, y: 9, width: 10, height: 11 },
      isDragging: false,
      isResizing: true,
    });

    applySelectionModeLocals(mutableRefs, nextLocals);

    expect(session.currentState).toBe('hover');
    expect(session.currentSelection).toEqual({ x: 8, y: 9, width: 10, height: 11 });
    expect(session.isDragging).toBe(false);
    expect(session.isResizing).toBe(true);
    expect('resolveCallback' in mutableRefs).toBe(false);
    expect('rejectCallback' in mutableRefs).toBe(false);
  });
});

describe('selection-mode session flow reset', () => {
  it('resets the mutable session back to the idle baseline', () => {
    const session = createSelectionModeSession(createStateFixture());

    resetSelectionModeSession(session);

    expect(session.aspectRatio).toBeNull();
    expect(session.currentState).toBe('idle');
    expect(session.currentSelection).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(session.isActive).toBe(false);
    expect(session.isDragging).toBe(false);
    expect(session.isResizing).toBe(false);
    expect(session.maintainAspectRatio).toBe(false);
    expect(session.mouseDownPoint).toBeNull();
    expect(session.rejectCallback).toBeNull();
    expect(session.resolveCallback).toBeNull();
    expect(session.resizeDirection).toBeNull();
    expect(session.selectionAtDragStart).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(session.skipNextClick).toBe(false);
  });
});
