// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  createSelectionModeSessionCleanupCallbackSetters,
  createSelectionModeSessionCleanupSetters,
} from './cleanup';
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

describe('selection-mode session locals cleanup', () => {
  it('writes the cleanup-owned session slices', () => {
    const session = createSession();
    const setters = createSelectionModeSessionCleanupSetters(session);
    const callbackSetters = createSelectionModeSessionCleanupCallbackSetters(session);
    const cleanupEventListeners = vi.fn();
    const cleanupScrollListeners = vi.fn();
    const nextDom = createSelectionModeDom();
    const hoveredElement = document.createElement('section');

    callbackSetters.setCleanupEventListeners(cleanupEventListeners);
    callbackSetters.setCleanupScrollListeners(cleanupScrollListeners);
    setters.setCurrentState('drag');
    setters.setDom(nextDom);
    setters.setHasMovedEnough(true);
    setters.setHoveredElement(hoveredElement);
    setters.setIsActive(true);
    setters.setIsDragging(true);
    setters.setIsResizing(true);
    setters.setMouseDownPoint({ x: 14, y: 15 });
    setters.setResizeDirection('nw');

    expect(session.currentState).toBe('drag');
    expect(session.cleanupEventListeners).toBe(cleanupEventListeners);
    expect(session.cleanupScrollListeners).toBe(cleanupScrollListeners);
    expect(session.dom).toBe(nextDom);
    expect(session.hoveredElement).toBe(hoveredElement);
    expect(session.mouseDownPoint).toEqual({ x: 14, y: 15 });
  });
});
