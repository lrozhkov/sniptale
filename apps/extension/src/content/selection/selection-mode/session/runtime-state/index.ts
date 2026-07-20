import type { SelectionModeMutableRefs } from '../locals-contract';
import { mergeSelectionModeRuntimeState } from './merge';
import type { SelectionModeRuntimeState } from './types';
import { createSelectionModePointerDragState } from './drag';
import { createSelectionModePointerHoverState } from './hover';
import { createSelectionModePointerInteractionState } from './interaction';
import { createSelectionModePointerSelectionState } from './selection';

export function createSelectionModePointerState(
  refs: SelectionModeMutableRefs
): Pick<
  SelectionModeRuntimeState,
  | 'dragStartPoint'
  | 'hasMovedEnough'
  | 'hoveredElement'
  | 'isActive'
  | 'mouseDownPoint'
  | 'resizeDirection'
  | 'selectionAtDragStart'
> {
  return mergeSelectionModeRuntimeState(
    createSelectionModePointerDragState(refs),
    createSelectionModePointerHoverState(refs),
    createSelectionModePointerInteractionState(refs),
    createSelectionModePointerSelectionState(refs)
  ) as Pick<
    SelectionModeRuntimeState,
    | 'dragStartPoint'
    | 'hasMovedEnough'
    | 'hoveredElement'
    | 'isActive'
    | 'mouseDownPoint'
    | 'resizeDirection'
    | 'selectionAtDragStart'
  >;
}
