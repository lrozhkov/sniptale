// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeDom } from '../ui';
import { createSelectionModeSession, resetSelectionModeSession } from '.';

describe('selection-mode session authority', () => {
  it('creates every field with the canonical idle defaults', () => {
    expect(createSelectionModeSession()).toEqual({
      aspectRatio: null,
      captureAction: 'download_default',
      cleanupEventListeners: null,
      cleanupScrollListeners: null,
      currentSelection: { x: 0, y: 0, width: 0, height: 0 },
      currentState: 'idle',
      cursorStyleCleanup: null,
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
      onCaptureActionChange: null,
      rejectCallback: null,
      resizeDirection: null,
      resolveCallback: null,
      selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
      skipNextClick: false,
    });
  });

  it('resets the same session while preserving cleanup-owned fields', () => {
    const session = createSelectionModeSession();
    const identity = session;
    const dom = createSelectionModeDom();
    const cursorStyleCleanup = vi.fn();
    Object.assign(session, {
      aspectRatio: 16 / 9,
      cleanupEventListeners: vi.fn(),
      cleanupScrollListeners: vi.fn(),
      currentSelection: { x: 10, y: 20, width: 300, height: 200 },
      currentState: 'confirmed',
      cursorStyleCleanup,
      dom,
      dragStartPoint: { x: 4, y: 5 },
      dragThreshold: 9,
      hasMovedEnough: true,
      hoveredElement: document.createElement('button'),
      isActive: true,
      isDragging: true,
      isResizing: true,
      maintainAspectRatio: true,
      mouseDownPoint: { x: 6, y: 7 },
      rejectCallback: vi.fn(),
      resizeDirection: 'se',
      resolveCallback: vi.fn(),
      selectionAtDragStart: { x: 1, y: 2, width: 3, height: 4 },
      skipNextClick: true,
    });

    resetSelectionModeSession(session);

    expect(session).toBe(identity);
    expect(session).toEqual({
      aspectRatio: null,
      captureAction: 'download_default',
      cleanupEventListeners: null,
      cleanupScrollListeners: null,
      currentSelection: { x: 0, y: 0, width: 0, height: 0 },
      currentState: 'idle',
      cursorStyleCleanup,
      dom,
      dragStartPoint: { x: 0, y: 0 },
      dragThreshold: 9,
      hasMovedEnough: false,
      hoveredElement: null,
      isActive: false,
      isDragging: false,
      isResizing: false,
      maintainAspectRatio: false,
      mouseDownPoint: null,
      onCaptureActionChange: null,
      rejectCallback: null,
      resizeDirection: null,
      resolveCallback: null,
      selectionAtDragStart: { x: 0, y: 0, width: 0, height: 0 },
      skipNextClick: false,
    });
  });
});
