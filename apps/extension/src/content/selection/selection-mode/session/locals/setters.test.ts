// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createSelectionModeSessionCleanupCallbackSetters,
  createSelectionModeSessionCleanupSetters,
  createSelectionModeSessionLocalSetters,
} from './setters';
import type { SelectionModeSession } from './contract';
import { createSelectionModeDom } from '../../ui';

function createSession(): SelectionModeSession {
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

function applyAllSessionLocalSetters(
  setters: ReturnType<typeof createSelectionModeSessionLocalSetters>
) {
  const cleanupEventListeners = vi.fn();
  const cleanupScrollListeners = vi.fn();
  const dom = createSelectionModeDom();
  const hoveredElement = document.createElement('button');

  setters.setAspectRatio(16 / 9);
  setters.setCleanupEventListeners(cleanupEventListeners);
  setters.setCleanupScrollListeners(cleanupScrollListeners);
  setters.setCurrentSelection({ x: 1, y: 2, width: 3, height: 4 });
  setters.setCurrentState('confirmed');
  setters.setDom(dom);
  setters.setDragStartPoint({ x: 5, y: 6 });
  setters.setDragThreshold(7);
  setters.setHasMovedEnough(true);
  setters.setHoveredElement(hoveredElement);
  setters.setIsActive(true);
  setters.setIsDragging(true);
  setters.setIsResizing(true);
  setters.setMaintainAspectRatio(true);
  setters.setMouseDownPoint({ x: 8, y: 9 });
  setters.setRejectCallback(null);
  setters.setResolveCallback(null);
  setters.setResizeDirection('se');
  setters.setSelectionAtDragStart({ x: 10, y: 11, width: 12, height: 13 });
  setters.setSkipNextClick(true);

  return { cleanupEventListeners, cleanupScrollListeners, dom, hoveredElement };
}

function expectSessionAfterLocalSetterUpdates(
  session: SelectionModeSession,
  applied: ReturnType<typeof applyAllSessionLocalSetters>
) {
  expect(session).toEqual({
    aspectRatio: 16 / 9,
    cleanupEventListeners: applied.cleanupEventListeners,
    cleanupScrollListeners: applied.cleanupScrollListeners,
    currentSelection: { x: 1, y: 2, width: 3, height: 4 },
    currentState: 'confirmed',
    dom: applied.dom,
    dragStartPoint: { x: 5, y: 6 },
    dragThreshold: 7,
    hasMovedEnough: true,
    hoveredElement: applied.hoveredElement,
    isActive: true,
    isDragging: true,
    isResizing: true,
    maintainAspectRatio: true,
    mouseDownPoint: { x: 8, y: 9 },
    rejectCallback: null,
    resolveCallback: null,
    resizeDirection: 'se',
    selectionAtDragStart: { x: 10, y: 11, width: 12, height: 13 },
    skipNextClick: true,
  });
}

describe('selection-mode session local setters', () => {
  it('writes every session-local field through the full setter facade', () => {
    const session = createSession();
    const applied = applyAllSessionLocalSetters(createSelectionModeSessionLocalSetters(session));

    expectSessionAfterLocalSetterUpdates(session, applied);
  });

  it('updates cleanup-owned state through the cleanup setter slices', () => {
    const session = createSession();
    const cleanupEventListeners = vi.fn();
    const cleanupScrollListeners = vi.fn();
    const hoveredElement = document.createElement('section');
    const dom = createSelectionModeDom();
    const cleanupSetters = createSelectionModeSessionCleanupSetters(session);
    const callbackSetters = createSelectionModeSessionCleanupCallbackSetters(session);

    callbackSetters.setCleanupEventListeners(cleanupEventListeners);
    callbackSetters.setCleanupScrollListeners(cleanupScrollListeners);
    cleanupSetters.setCurrentState('drag');
    cleanupSetters.setDom(dom);
    cleanupSetters.setHasMovedEnough(true);
    cleanupSetters.setHoveredElement(hoveredElement);
    cleanupSetters.setIsActive(true);
    cleanupSetters.setIsDragging(true);
    cleanupSetters.setIsResizing(true);
    cleanupSetters.setMouseDownPoint({ x: 14, y: 15 });
    cleanupSetters.setResizeDirection('nw');

    expect(session.cleanupEventListeners).toBe(cleanupEventListeners);
    expect(session.cleanupScrollListeners).toBe(cleanupScrollListeners);
    expect(session.currentState).toBe('drag');
    expect(session.dom).toBe(dom);
    expect(session.hasMovedEnough).toBe(true);
    expect(session.hoveredElement).toBe(hoveredElement);
    expect(session.isActive).toBe(true);
    expect(session.isDragging).toBe(true);
    expect(session.isResizing).toBe(true);
    expect(session.mouseDownPoint).toEqual({ x: 14, y: 15 });
    expect(session.resizeDirection).toBe('nw');
  });
});
