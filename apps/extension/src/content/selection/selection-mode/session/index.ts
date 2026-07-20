import { createSelectionModeLocalsSnapshot } from './locals-contract';
import type { SelectionModeState } from './state';
import type { SelectionModeSession } from './locals/contract';
import { createSelectionModeSessionLocalSetters } from './locals/setters';

/**
 * Creates mutable session locals from the current selection-mode state snapshot.
 */
export function createSelectionModeSession(state: SelectionModeState): SelectionModeSession {
  return createSelectionModeLocalsSnapshot(state);
}

/**
 * Resets mutable session locals back to the idle selection-mode baseline.
 */
export function resetSelectionModeSession(session: SelectionModeSession): void {
  const setters = createSelectionModeSessionLocalSetters(session);

  setters.setAspectRatio(null);
  setters.setCleanupEventListeners(null);
  setters.setCleanupScrollListeners(null);
  setters.setCurrentSelection({ x: 0, y: 0, width: 0, height: 0 });
  setters.setCurrentState('idle');
  setters.setDragStartPoint({ x: 0, y: 0 });
  setters.setHasMovedEnough(false);
  setters.setHoveredElement(null);
  setters.setIsActive(false);
  setters.setIsDragging(false);
  setters.setIsResizing(false);
  setters.setMaintainAspectRatio(false);
  setters.setMouseDownPoint(null);
  setters.setRejectCallback(null);
  setters.setResolveCallback(null);
  setters.setResizeDirection(null);
  setters.setSelectionAtDragStart({ x: 0, y: 0, width: 0, height: 0 });
  setters.setSkipNextClick(false);
}
