import { resolveSelectionModePointerTarget } from './target';
import type { SelectionModeEventOptions, SelectionModeInteractionState } from '../types';

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

function handleHoverStateMove(
  event: MouseEvent,
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

  if (!state.mouseDownPoint || state.hasMovedEnough) {
    return;
  }

  const dx = event.clientX - state.mouseDownPoint.x;
  const dy = event.clientY - state.mouseDownPoint.y;
  if (Math.abs(dx) > state.dragThreshold || Math.abs(dy) > state.dragThreshold) {
    state.hasMovedEnough = true;
    options.startDragSelection(state.mouseDownPoint.x, state.mouseDownPoint.y);
  }
}

function handleConfirmedStateMove(
  event: MouseEvent,
  state: SelectionModeInteractionState,
  options: SelectionModeMouseMoveOptions
): void {
  if (state.isDragging) {
    options.handleDragMove(event);
    return;
  }

  if (state.isResizing && state.resizeDirection) {
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

  const target = resolveSelectionModePointerTarget(event, iframe);
  if (!target) {
    options.hideHoverFrame();
    return;
  }

  if (state.currentState === 'idle' || state.currentState === 'hover') {
    handleHoverStateMove(event, state, options, target, iframe);
    return;
  }

  if (state.currentState === 'drag') {
    options.updateDragSelection(event.clientX, event.clientY);
    return;
  }

  if (state.currentState === 'confirmed') {
    handleConfirmedStateMove(event, state, options);
  }
}
