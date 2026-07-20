import type { SelectionModeMutableLocals } from './types';

export function createSelectionModeMutableRefReaders(getLocals: () => SelectionModeMutableLocals) {
  return {
    getAspectRatio: () => getLocals().aspectRatio,
    getCleanupEventListeners: () => getLocals().cleanupEventListeners,
    getCleanupScrollListeners: () => getLocals().cleanupScrollListeners,
    getCurrentSelection: () => getLocals().currentSelection,
    getCurrentState: () => getLocals().currentState,
    getDom: () => getLocals().dom,
    getDragStartPoint: () => getLocals().dragStartPoint,
    getDragThreshold: () => getLocals().dragThreshold,
    getHasMovedEnough: () => getLocals().hasMovedEnough,
    getHoveredElement: () => getLocals().hoveredElement,
    getIsActive: () => getLocals().isActive,
    getIsDragging: () => getLocals().isDragging,
    getIsResizing: () => getLocals().isResizing,
    getMaintainAspectRatio: () => getLocals().maintainAspectRatio,
    getMouseDownPoint: () => getLocals().mouseDownPoint,
    getResizeDirection: () => getLocals().resizeDirection,
    getSelectionAtDragStart: () => getLocals().selectionAtDragStart,
    getSkipNextClick: () => getLocals().skipNextClick,
  };
}
