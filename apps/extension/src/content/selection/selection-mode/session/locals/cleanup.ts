import type { SelectionModeSession } from './contract';
import {
  createSelectionModeSessionCallbackSetters,
  createSelectionModeSessionInteractionStateSetters,
  createSelectionModeSessionStateDomSetters,
} from './setter-groups';

export function createSelectionModeSessionCleanupSetters(
  session: Pick<
    SelectionModeSession,
    | 'cleanupEventListeners'
    | 'cleanupScrollListeners'
    | 'currentState'
    | 'dom'
    | 'hasMovedEnough'
    | 'hoveredElement'
    | 'isActive'
    | 'isDragging'
    | 'isResizing'
    | 'mouseDownPoint'
    | 'resizeDirection'
  >
) {
  return {
    ...createSelectionModeSessionStateDomSetters(session),
    ...createSelectionModeSessionInteractionStateSetters(session),
  };
}

export function createSelectionModeSessionCleanupCallbackSetters(
  session: Pick<SelectionModeSession, 'cleanupEventListeners' | 'cleanupScrollListeners'>
) {
  return createSelectionModeSessionCallbackSetters(session);
}
