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
  let cleanupError: Error | null = null;

  try {
    state.cleanupEventListeners?.();
  } catch (error) {
    cleanupError = normalizeSelectionModeCleanupError(error);
  } finally {
    state.cleanupEventListeners = null;
  }

  try {
    state.cleanupScrollListeners?.();
  } catch (error) {
    cleanupError ??= normalizeSelectionModeCleanupError(error);
  } finally {
    state.cleanupScrollListeners = null;
  }

  return cleanupError;
}

export function cleanupSelectionModeRuntime(
  state: CleanupRuntimeState,
  handleKeyDown: (event: KeyboardEvent) => void
): void {
  let cleanupError = runSelectionModeCleanupCallbacks(state);

  try {
    document.removeEventListener('keydown', handleKeyDown);

    removeDragEventCatcher(state.dom);
    cleanupSelectionModeDom(state.dom);
  } catch (error) {
    cleanupError ??= normalizeSelectionModeCleanupError(error);
  } finally {
    state.dom = createSelectionModeDom();
    state.isActive = false;
    state.currentState = 'idle';
    state.isDragging = false;
    state.isResizing = false;
    state.resizeDirection = null;
    state.hoveredElement = null;
    state.mouseDownPoint = null;
    state.hasMovedEnough = false;
  }

  if (cleanupError) {
    throw cleanupError;
  }
}
