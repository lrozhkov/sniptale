import { applySelectionModeDragSelection } from '../../interaction/actions';
import type {
  SelectionModeDragSelectionRuntime,
  SelectionModeRuntimeActionsArgs,
} from '../../interaction/actions/types';

export function getDragSelectionRuntime(
  args: SelectionModeRuntimeActionsArgs
): SelectionModeDragSelectionRuntime {
  return applySelectionModeDragSelection({
    createDragFrame: args.createDragFrame,
    currentSelection: args.state.currentSelection,
    dom: args.state.dom,
    dragStartPoint: args.state.dragStartPoint,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    minSelectionSize: args.minSelectionSize,
    resizeDirection: args.state.resizeDirection,
    selectionAtDragStart: args.state.selectionAtDragStart,
    maintainAspectRatio: args.state.maintainAspectRatio,
    aspectRatio: args.state.aspectRatio,
    zIndexBase: args.zIndexBase,
  });
}
