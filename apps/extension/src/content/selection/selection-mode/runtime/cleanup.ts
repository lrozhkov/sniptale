import {
  createSelectionModeSessionCleanupCallbackSetters,
  createSelectionModeSessionCleanupSetters,
} from '../session/locals/setters';
import { cleanupSelectionModeDom, removeDragEventCatcher } from '../ui';
import type { ResizeDirection, SelectionModeDom } from '../ui/dom-types';
import { createSelectionModeDom } from '../ui';
import type { SelectionState } from '../types';

type CleanupCallbackState = {
  cleanupEventListeners: (() => void) | null;
  cleanupScrollListeners: (() => void) | null;
};

type CleanupRuntimeState = CleanupCallbackState & {
  currentState: SelectionState;
  dom: SelectionModeDom;
  hasMovedEnough: boolean;
  hoveredElement: HTMLElement | null;
  isActive: boolean;
  isDragging: boolean;
  isResizing: boolean;
  mouseDownPoint: { x: number; y: number } | null;
  resizeDirection: ResizeDirection | null;
};

function normalizeSelectionModeCleanupError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function runSelectionModeCleanupCallbacks(state: CleanupCallbackState): Error | null {
  const stateSetters = createSelectionModeSessionCleanupCallbackSetters(state);
  let cleanupError: Error | null = null;

  try {
    state.cleanupEventListeners?.();
  } catch (error) {
    cleanupError = normalizeSelectionModeCleanupError(error);
  } finally {
    stateSetters.setCleanupEventListeners(null);
  }

  try {
    state.cleanupScrollListeners?.();
  } catch (error) {
    cleanupError ??= normalizeSelectionModeCleanupError(error);
  } finally {
    stateSetters.setCleanupScrollListeners(null);
  }

  return cleanupError;
}

export function cleanupSelectionModeRuntime(
  state: CleanupRuntimeState,
  handleKeyDown: (event: KeyboardEvent) => void
): void {
  const stateSetters = createSelectionModeSessionCleanupSetters(state);
  let cleanupError = runSelectionModeCleanupCallbacks(state);

  try {
    document.removeEventListener('keydown', handleKeyDown);
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    removeDragEventCatcher(state.dom);
    cleanupSelectionModeDom(state.dom);
  } catch (error) {
    cleanupError ??= normalizeSelectionModeCleanupError(error);
  } finally {
    stateSetters.setDom(createSelectionModeDom());
    stateSetters.setIsActive(false);
    stateSetters.setCurrentState('idle');
    stateSetters.setIsDragging(false);
    stateSetters.setIsResizing(false);
    stateSetters.setResizeDirection(null);
    stateSetters.setHoveredElement(null);
    stateSetters.setMouseDownPoint(null);
    stateSetters.setHasMovedEnough(false);
  }

  if (cleanupError) {
    throw cleanupError;
  }
}
