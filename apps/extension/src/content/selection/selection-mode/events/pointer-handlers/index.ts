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

function handlePendingDragCandidateMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeMouseMoveOptions
): boolean {
  if (!state.mouseDownPoint || state.hasMovedEnough) return false;
  stopSelectionModeEvent(event);
  const dx = event.clientX - state.mouseDownPoint.x;
  const dy = event.clientY - state.mouseDownPoint.y;
  if (Math.abs(dx) > state.dragThreshold || Math.abs(dy) > state.dragThreshold) {
    state.hasMovedEnough = true;
    options.startDragSelection(state.mouseDownPoint.x, state.mouseDownPoint.y);
  }
  return true;
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
    stopSelectionModeEvent(event);
    options.updateDragSelection(event.clientX, event.clientY);
    return;
  }

  if (state.currentState === 'confirmed') {
    handleConfirmedStateMove(event, state, options);
    return;
  }

  if (
    (state.currentState === 'idle' || state.currentState === 'hover') &&
    handlePendingDragCandidateMove(event, state, options)
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
  if (!state.isActive) {
    return;
  }

  if (state.currentState === 'drag') {
    stopSelectionModeEvent(event);
    logSelectionModeDragFinalize(state);
    options.finalizeDragSelection();
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
