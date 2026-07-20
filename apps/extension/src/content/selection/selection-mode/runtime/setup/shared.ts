import type { SelectionModeMutableRefs } from '../../session/locals-contract';
import type { MutableRefSetterArgs } from './types';

export function mergeSelectionModeMutableRefGetters(
  ...getterSlices: object[]
): SelectionModeMutableRefs {
  const refs = {} as SelectionModeMutableRefs;

  for (const getterSlice of getterSlices) {
    Object.defineProperties(refs, Object.getOwnPropertyDescriptors(getterSlice));
  }

  return refs;
}

export function defineSelectionModeMutableRefSetters(
  refs: SelectionModeMutableRefs,
  args: MutableRefSetterArgs
): SelectionModeMutableRefs {
  Object.defineProperties(refs, {
    aspectRatio: { set: args.setAspectRatio },
    cleanupEventListeners: { set: args.setCleanupEventListeners },
    cleanupScrollListeners: { set: args.setCleanupScrollListeners },
    currentSelection: { set: args.setCurrentSelection },
    currentState: { set: args.setCurrentState },
    dom: { set: args.setDom },
    dragStartPoint: { set: args.setDragStartPoint },
    dragThreshold: { set: args.setDragThreshold },
    hasMovedEnough: { set: args.setHasMovedEnough },
    hoveredElement: { set: args.setHoveredElement },
    isActive: { set: args.setIsActive },
    isDragging: { set: args.setIsDragging },
    isResizing: { set: args.setIsResizing },
    maintainAspectRatio: { set: args.setMaintainAspectRatio },
    mouseDownPoint: { set: args.setMouseDownPoint },
    resizeDirection: { set: args.setResizeDirection },
    selectionAtDragStart: { set: args.setSelectionAtDragStart },
    skipNextClick: { set: args.setSkipNextClick },
  });

  return refs;
}
