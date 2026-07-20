import { logSelectionModeKeyAction } from '../diag';
import { isSelectionModeControl, stopSelectionModeEvent } from './helpers';
import { resolveSelectionModePointerTarget } from './pointer-handlers/target';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from './types';

export function handleSelectionModeClick(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeEventOptions,
  iframe?: HTMLIFrameElement
): void {
  if (!state.isActive) {
    return;
  }

  if (state.skipNextClick) {
    state.skipNextClick = false;
    return;
  }

  const target = resolveSelectionModePointerTarget(event, iframe);
  if (!target) {
    return;
  }

  if (options.isExtensionUIElement(target)) {
    if (!isSelectionModeControl(target)) {
      stopSelectionModeEvent(event);
    }
    return;
  }

  stopSelectionModeEvent(event);

  if ((state.currentState === 'idle' || state.currentState === 'hover') && !state.hasMovedEnough) {
    options.selectElement(state.hoveredElement ?? target, iframe);
    return;
  }

  if (state.currentState === 'confirmed' && !target.closest('.sniptale-selection-final-frame')) {
    options.resetToIdleState();
  }
}

export function handleSelectionModeKeyDown(
  event: KeyboardEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeEventOptions
): void {
  if (!state.isActive) {
    return;
  }

  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    logSelectionModeKeyAction('cancel', state);
    options.cancelSelection();
    return;
  }

  if (event.key === 'Enter' && state.currentState === 'confirmed') {
    event.preventDefault();
    logSelectionModeKeyAction('confirm', state);
    options.confirmSelection();
  }
}
