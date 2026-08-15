import {
  logSelectionModeDragFinalize,
  logSelectionModePointerFinish,
  logSelectionModeRuntime,
} from '../../diag';
import {
  handleSelectionModeConfirmedMouseDown,
  handleSelectionModeIdleMouseDown,
  stopSelectionModeEvent,
} from '../helpers';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';
import { resolveSelectionModePointerTarget } from './target';

type SelectionModeMouseMoveOptions = Pick<
  SelectionModeEventOptions,
  | 'handleDragMove'
  | 'handleResizeMove'
  | 'hideHoverFrame'
  | 'isExtensionUIElement'
  | 'showHoverFrame'
  | 'startDragSelection'
  | 'updateDragSelection'
>;

export function handleSelectionModeDragStart(
  event: DragEvent,
  state: SelectionModeInteractionState,
  options: Pick<SelectionModeEventOptions, 'startDragSelection' | 'updateDragSelection'>
): void {
  if (!state.isActive) {
    return;
  }

  if (state.currentState === 'drag') {
    stopSelectionModeEvent(event);
    state.hasMovedEnough = true;
    options.updateDragSelection(event.clientX, event.clientY);
    return;
  }

  if ((state.currentState !== 'idle' && state.currentState !== 'hover') || !state.mouseDownPoint) {
    return;
  }

  stopSelectionModeEvent(event);
  state.hasMovedEnough = true;
  options.startDragSelection(state.mouseDownPoint.x, state.mouseDownPoint.y);
  options.updateDragSelection(event.clientX, event.clientY);
}

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
    handleSelectionModeIdleMouseDown(event, state, options, target);
    return;
  }

  if (state.currentState !== 'confirmed') {
    return;
  }

  handleSelectionModeConfirmedMouseDown(event, state, options.isExtensionUIElement, target);
}

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

function handleHoverStateMove(
  state: SelectionModeInteractionState,
  options: SelectionModeMouseMoveOptions,
  target: HTMLElement,
  iframe?: HTMLIFrameElement
): void {
  if (options.isExtensionUIElement(target)) {
    options.hideHoverFrame();
    return;
  }

  state.hoveredElement = target;
  options.showHoverFrame(target, iframe);
}

function handleConfirmedStateMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeMouseMoveOptions
): void {
  if (state.isDragging) {
    stopSelectionModeEvent(event);
    options.handleDragMove(event);
    return;
  }

  if (state.isResizing && state.resizeDirection) {
    stopSelectionModeEvent(event);
    options.handleResizeMove(event);
  }
}

function handlePendingAreaSelectionMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: Pick<SelectionModeEventOptions, 'startDragSelection' | 'updateDragSelection'>
): boolean {
  if (!state.mouseDownPoint || state.hasMovedEnough) return false;
  stopSelectionModeEvent(event);
  const dx = event.clientX - state.mouseDownPoint.x;
  const dy = event.clientY - state.mouseDownPoint.y;
  if (Math.abs(dx) <= state.dragThreshold && Math.abs(dy) <= state.dragThreshold) return true;
  state.hasMovedEnough = true;
  options.startDragSelection(state.mouseDownPoint.x, state.mouseDownPoint.y);
  options.updateDragSelection(event.clientX, event.clientY);
  return true;
}

function handleAreaSelectionMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  updateDragSelection: SelectionModeEventOptions['updateDragSelection']
): void {
  stopSelectionModeEvent(event);
  if (!state.mouseDownPoint) return;
  const dx = event.clientX - state.mouseDownPoint.x;
  const dy = event.clientY - state.mouseDownPoint.y;
  if (
    !state.hasMovedEnough &&
    Math.abs(dx) <= state.dragThreshold &&
    Math.abs(dy) <= state.dragThreshold
  ) {
    return;
  }
  state.hasMovedEnough = true;
  updateDragSelection(event.clientX, event.clientY);
}

export function handleSelectionModeMouseMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeMouseMoveOptions,
  iframe?: HTMLIFrameElement
): void {
  if (!state.isActive) {
    return;
  }

  if (state.currentState === 'drag') {
    handleAreaSelectionMove(event, state, options.updateDragSelection);
    return;
  }

  if (state.currentState === 'confirmed') {
    handleConfirmedStateMove(event, state, options);
    return;
  }

  if (
    (state.currentState === 'idle' || state.currentState === 'hover') &&
    handlePendingAreaSelectionMove(event, state, options)
  ) {
    return;
  }

  const target = resolveSelectionModePointerTarget(event, iframe);
  if (!target) {
    options.hideHoverFrame();
    return;
  }

  if (state.currentState === 'idle' || state.currentState === 'hover') {
    handleHoverStateMove(state, options, target, iframe);
    return;
  }
}

function finalizePendingDragWithoutMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: Pick<
    SelectionModeEventOptions,
    'finalizeDragSelection' | 'startDragSelection' | 'updateDragSelection'
  >
): void {
  if (
    (state.currentState !== 'idle' && state.currentState !== 'hover') ||
    !state.mouseDownPoint ||
    (Math.abs(event.clientX - state.mouseDownPoint.x) <= state.dragThreshold &&
      Math.abs(event.clientY - state.mouseDownPoint.y) <= state.dragThreshold)
  ) {
    return;
  }
  stopSelectionModeEvent(event);
  options.startDragSelection(state.mouseDownPoint.x, state.mouseDownPoint.y);
  options.updateDragSelection(event.clientX, event.clientY);
  options.finalizeDragSelection();
  state.skipNextClick = true;
}

export function handleSelectionModeMouseUp(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: Pick<
    SelectionModeEventOptions,
    'finalizeDragSelection' | 'flushFinalFrameUpdate' | 'startDragSelection' | 'updateDragSelection'
  >
): void {
  handleSelectionModeMouseUpOwned(event, state, options);
}

function handleSelectionModeMouseUpOwned(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: Pick<
    SelectionModeEventOptions,
    'finalizeDragSelection' | 'flushFinalFrameUpdate' | 'startDragSelection' | 'updateDragSelection'
  >
): void {
  if (!state.isActive) return;

  if (state.currentState === 'drag') {
    stopSelectionModeEvent(event);
    logSelectionModeDragFinalize(state);
    if (state.hasMovedEnough) {
      options.updateDragSelection(event.clientX, event.clientY);
    }
    options.finalizeDragSelection();
    state.skipNextClick = state.hasMovedEnough;
    state.mouseDownPoint = null;
    state.hasMovedEnough = false;
    return;
  }

  if (state.currentState === 'confirmed') {
    if (state.isDragging || state.isResizing) {
      stopSelectionModeEvent(event);
      options.flushFinalFrameUpdate();
      logSelectionModePointerFinish(state);
      state.skipNextClick = true;
    }
    state.isDragging = false;
    state.isResizing = false;
    state.resizeDirection = null;
  }

  finalizePendingDragWithoutMove(event, state, options);

  state.mouseDownPoint = null;
  state.hasMovedEnough = false;
}
