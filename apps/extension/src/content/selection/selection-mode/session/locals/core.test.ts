// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createSelectionModeSessionLocalSetters } from './core';
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

function applySessionLocalSetters(session: SelectionModeSession) {
  const setters = createSelectionModeSessionLocalSetters(session);
  const cleanupEventListeners = vi.fn();
  const cleanupScrollListeners = vi.fn();
  const nextDom = createSelectionModeDom();

  setters.setAspectRatio(16 / 9);
  setters.setCleanupEventListeners(cleanupEventListeners);
  setters.setCleanupScrollListeners(cleanupScrollListeners);
  setters.setCurrentSelection({ x: 1, y: 2, width: 3, height: 4 });
  setters.setCurrentState('confirmed');
  setters.setDom(nextDom);
  setters.setDragStartPoint({ x: 5, y: 6 });
  setters.setDragThreshold(7);
  setters.setHasMovedEnough(true);
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

  return { cleanupEventListeners, cleanupScrollListeners, nextDom };
}

describe('selection-mode session locals core', () => {
  it('writes the full local setter surface onto the session', () => {
    const session = createSession();
    const { cleanupEventListeners, cleanupScrollListeners, nextDom } =
      applySessionLocalSetters(session);

    expect(session).toMatchObject({
      aspectRatio: 16 / 9,
      cleanupEventListeners,
      cleanupScrollListeners,
      currentSelection: { x: 1, y: 2, width: 3, height: 4 },
      currentState: 'confirmed',
      dom: nextDom,
      dragStartPoint: { x: 5, y: 6 },
      dragThreshold: 7,
      hasMovedEnough: true,
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
  });
});
