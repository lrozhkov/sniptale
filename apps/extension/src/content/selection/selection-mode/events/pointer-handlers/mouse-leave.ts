import { logSelectionModeRuntime } from '../../diag';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

export function handleSelectionModeMouseLeave(
  state: SelectionModeInteractionState,
  options: Pick<SelectionModeEventOptions, 'hideHoverFrame'>
): void {
  if (!state.isActive) {
    return;
  }

  if (state.currentState === 'idle' || state.currentState === 'hover') {
    options.hideHoverFrame();
    logSelectionModeRuntime('Hover preview hidden - cursor left viewport');
  }
}
