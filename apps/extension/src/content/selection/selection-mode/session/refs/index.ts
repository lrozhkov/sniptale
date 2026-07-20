import type {
  SelectionModeMutableLocals,
  SelectionModeMutableLocalsSetters,
} from '../locals-contract';
import { createSelectionModeMutableRefs as createSelectionModeMutableRefsRuntime } from '../../runtime/setup';
import { createSelectionModeMutableRefReaders } from './readers';

export function createSelectionModeMutableRefs(
  args: {
    getLocals: () => SelectionModeMutableLocals;
  } & SelectionModeMutableLocalsSetters
) {
  return createSelectionModeMutableRefsRuntime({
    ...createSelectionModeMutableRefReaders(args.getLocals),
    setAspectRatio: args.setAspectRatio,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    setCurrentSelection: args.setCurrentSelection,
    setCurrentState: args.setCurrentState,
    setDom: args.setDom,
    setDragStartPoint: args.setDragStartPoint,
    setDragThreshold: args.setDragThreshold,
    setHasMovedEnough: args.setHasMovedEnough,
    setHoveredElement: args.setHoveredElement,
    setIsActive: args.setIsActive,
    setIsDragging: args.setIsDragging,
    setIsResizing: args.setIsResizing,
    setMaintainAspectRatio: args.setMaintainAspectRatio,
    setMouseDownPoint: args.setMouseDownPoint,
    setResizeDirection: args.setResizeDirection,
    setSelectionAtDragStart: args.setSelectionAtDragStart,
    setSkipNextClick: args.setSkipNextClick,
  });
}
