// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { cleanupSelectionModeRuntime } from './cleanup';
import { createSelectionModeDom } from '../ui';
import type { SelectionState } from '../types';

function createActiveRuntimeState() {
  const overlayContainer = document.createElement('div');
  document.body.appendChild(overlayContainer);

  return {
    overlayContainer,
    state: {
      cleanupEventListeners: vi.fn(),
      cleanupScrollListeners: vi.fn(),
      currentState: 'confirmed' as SelectionState,
      dom: {
        ...createSelectionModeDom(),
        overlayContainer,
      },
      hasMovedEnough: true,
      hoveredElement: document.body,
      isActive: true,
      isDragging: true,
      isResizing: true,
      mouseDownPoint: { x: 10, y: 20 },
      resizeDirection: 'se' as const,
    },
  };
}

describe('selection-mode runtime cleanup', () => {
  it('marks the runtime inactive and tears down DOM state', () => {
    const { overlayContainer, state } = createActiveRuntimeState();

    cleanupSelectionModeRuntime(state, vi.fn());

    expect(state.cleanupEventListeners).toBeNull();
    expect(state.cleanupScrollListeners).toBeNull();
    expect(state.isActive).toBe(false);
    expect(state.currentState).toBe('idle');
    expect(state.isDragging).toBe(false);
    expect(state.isResizing).toBe(false);
    expect(state.resizeDirection).toBeNull();
    expect(state.hoveredElement).toBeNull();
    expect(state.mouseDownPoint).toBeNull();
    expect(state.hasMovedEnough).toBe(false);
    expect(document.body.contains(overlayContainer)).toBe(false);
    expect(state.dom.overlayContainer).toBeNull();
  });

  it('resets owned runtime state without mutating host body styles when cleanup fails', () => {
    const { overlayContainer, state } = createActiveRuntimeState();
    document.body.style.userSelect = 'text';
    document.body.style.webkitUserSelect = 'text';
    state.currentState = 'drag';
    state.cleanupEventListeners.mockImplementation(() => {
      throw new Error('cleanup failed');
    });

    expect(() => cleanupSelectionModeRuntime(state, vi.fn())).toThrow('cleanup failed');
    expect(state.cleanupEventListeners).toBeNull();
    expect(state.cleanupScrollListeners).toBeNull();
    expect(state.isActive).toBe(false);
    expect(state.currentState).toBe('idle');
    expect(document.body.style.userSelect).toBe('text');
    expect(document.body.style.webkitUserSelect).toBe('text');
    expect(document.body.contains(overlayContainer)).toBe(false);
  });
});
