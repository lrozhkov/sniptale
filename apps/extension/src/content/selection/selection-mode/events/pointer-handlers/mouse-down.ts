import { resolveSelectionModePointerTarget } from './target';
import {
  handleSelectionModeConfirmedMouseDown,
  handleSelectionModeIdleMouseDown,
} from '../helpers';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

export function handleSelectionModeMouseDown(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: Pick<SelectionModeEventOptions, 'isExtensionUIElement'>,
  iframe?: HTMLIFrameElement
): void {
  if (!state.isActive) {
    return;
  }

  const target = resolveSelectionModePointerTarget(event, iframe);
  if (!target) {
    return;
  }

  if (state.currentState === 'idle' || state.currentState === 'hover') {
    handleSelectionModeIdleMouseDown(event, state, options.isExtensionUIElement, target);
    return;
  }

  if (state.currentState !== 'confirmed') {
    return;
  }

  handleSelectionModeConfirmedMouseDown(event, state, options.isExtensionUIElement, target);
}
