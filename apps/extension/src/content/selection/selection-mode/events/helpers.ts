import { SELECTION_MODE_CONTROL_SELECTOR } from './constants';
import { logSelectionModeDragStart, logSelectionModeResizeStart } from '../diag';
import type { SelectionModeInteractionState } from './types';
import type { ResizeDirection } from '../ui';

export function stopSelectionModeEvent(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function isSelectionModeControl(target: HTMLElement): boolean {
  return Boolean(target.closest(SELECTION_MODE_CONTROL_SELECTOR));
}

export function handleSelectionModeIdleMouseDown(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  isExtensionUIElement: (target: HTMLElement) => boolean,
  target: HTMLElement
): void {
  if (isExtensionUIElement(target)) {
    stopSelectionModeEvent(event);
    return;
  }

  state.mouseDownPoint = { x: event.clientX, y: event.clientY };
  state.hasMovedEnough = false;
}

export function handleSelectionModeConfirmedMouseDown(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  isExtensionUIElement: (target: HTMLElement) => boolean,
  target: HTMLElement
): void {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }

  if (isSelectionModeControl(target)) {
    return;
  }

  const handle = target.closest('.sniptale-resize-handle');
  if (handle) {
    stopSelectionModeEvent(event);
    state.isResizing = true;
    state.resizeDirection = handle.getAttribute('data-direction') as ResizeDirection;
    state.dragStartPoint = { x: event.clientX, y: event.clientY };
    state.selectionAtDragStart = { ...state.currentSelection };
    logSelectionModeResizeStart(event, state);
    return;
  }

  if (
    target.closest('.sniptale-selection-final-frame') &&
    !target.closest('.sniptale-content-size-tooltip')
  ) {
    stopSelectionModeEvent(event);
    state.isDragging = true;
    state.dragStartPoint = { x: event.clientX, y: event.clientY };
    state.selectionAtDragStart = { ...state.currentSelection };
    logSelectionModeDragStart(event, state);
    return;
  }

  if (isExtensionUIElement(target)) {
    stopSelectionModeEvent(event);
  }
}
