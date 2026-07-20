import { logSelectionModeDragFinalize, logSelectionModePointerFinish } from '../../diag';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

export function handleSelectionModeMouseUp(
  state: SelectionModeInteractionState,
  options: Pick<SelectionModeEventOptions, 'finalizeDragSelection'>
): void {
  if (!state.isActive) {
    return;
  }

  if (state.currentState === 'drag') {
    logSelectionModeDragFinalize(state);
    options.finalizeDragSelection();
    state.mouseDownPoint = null;
    state.hasMovedEnough = false;
    return;
  }

  if (state.currentState === 'confirmed') {
    if (state.isDragging || state.isResizing) {
      logSelectionModePointerFinish(state);
      state.skipNextClick = true;
    }
    state.isDragging = false;
    state.isResizing = false;
    state.resizeDirection = null;
  }

  state.mouseDownPoint = null;
  state.hasMovedEnough = false;
}
