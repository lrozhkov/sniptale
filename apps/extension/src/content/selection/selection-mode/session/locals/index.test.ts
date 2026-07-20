// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  createSelectionModeSessionCleanupCallbackSetters,
  createSelectionModeSessionCleanupSetters,
  createSelectionModeSessionLocalSetters,
} from '.';
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

describe('selection-mode full session local setters', () => {
  it('writes core and interaction locals through the full setter facade', () => {
    const session = createSession();
    const hoveredElement = document.createElement('button');
    const setters = createSelectionModeSessionLocalSetters(session);

    setters.setAspectRatio(16 / 9);
    setters.setCleanupEventListeners(vi.fn());
    setters.setCleanupScrollListeners(vi.fn());
    setters.setCurrentSelection({ x: 1, y: 2, width: 3, height: 4 });
    setters.setCurrentState('confirmed');
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

    expect(session.aspectRatio).toBe(16 / 9);
    expect(session.currentState).toBe('confirmed');
    expect(session.hoveredElement).toBe(hoveredElement);
    expect(session.skipNextClick).toBe(true);
  });
});

describe('selection-mode cleanup session local setters', () => {
  it('updates cleanup locals through the cleanup setter slices', () => {
    const session = createSession();
    const hoveredElement = document.createElement('section');
    const cleanupSetters = createSelectionModeSessionCleanupSetters(session);
    const callbackSetters = createSelectionModeSessionCleanupCallbackSetters(session);

    callbackSetters.setCleanupEventListeners(vi.fn());
    callbackSetters.setCleanupScrollListeners(vi.fn());
    cleanupSetters.setCurrentState('drag');
    cleanupSetters.setDom(createSelectionModeDom());
    cleanupSetters.setHasMovedEnough(true);
    cleanupSetters.setHoveredElement(hoveredElement);
    cleanupSetters.setIsActive(true);
    cleanupSetters.setIsDragging(true);
    cleanupSetters.setIsResizing(true);
    cleanupSetters.setMouseDownPoint({ x: 14, y: 15 });
    cleanupSetters.setResizeDirection('nw');

    expect(session.currentState).toBe('drag');
    expect(session.hoveredElement).toBe(hoveredElement);
    expect(session.mouseDownPoint).toEqual({ x: 14, y: 15 });
  });
});
