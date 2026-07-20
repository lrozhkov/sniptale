import type { SelectionModeSession } from './contract';

export function createSelectionModeSessionCallbackSetters(
  session: Pick<SelectionModeSession, 'cleanupEventListeners' | 'cleanupScrollListeners'>
) {
  return {
    setCleanupEventListeners: (value: (() => void) | null) => {
      session.cleanupEventListeners = value;
    },
    setCleanupScrollListeners: (value: (() => void) | null) => {
      session.cleanupScrollListeners = value;
    },
  };
}

export function createSelectionModeSessionStateDomSetters(
  session: Pick<SelectionModeSession, 'currentState' | 'dom'>
) {
  return {
    setCurrentState: (value: SelectionModeSession['currentState']) => {
      session.currentState = value;
    },
    setDom: (value: SelectionModeSession['dom']) => {
      session.dom = value;
    },
  };
}

export function createSelectionModeSessionInteractionStateSetters(
  session: Pick<
    SelectionModeSession,
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
    setHasMovedEnough: (value: boolean) => {
      session.hasMovedEnough = value;
    },
    setHoveredElement: (value: SelectionModeSession['hoveredElement']) => {
      session.hoveredElement = value;
    },
    setIsActive: (value: boolean) => {
      session.isActive = value;
    },
    setIsDragging: (value: boolean) => {
      session.isDragging = value;
    },
    setIsResizing: (value: boolean) => {
      session.isResizing = value;
    },
    setMouseDownPoint: (value: SelectionModeSession['mouseDownPoint']) => {
      session.mouseDownPoint = value;
    },
    setResizeDirection: (value: SelectionModeSession['resizeDirection']) => {
      session.resizeDirection = value;
    },
  };
}
