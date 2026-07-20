import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';
import { getDragSelectionRuntime } from './runtime';

function updateSelectionModeDragFrame(args: SelectionModeRuntimeActionsArgs): void {
  getDragSelectionRuntime(args).updateDragFrame();
}

export function startSelectionModeDragSelection(
  args: SelectionModeRuntimeActionsArgs,
  startX: number,
  startY: number
): void {
  const next = getDragSelectionRuntime(args).startDragSelection(startX, startY);
  args.state.currentSelection = next.currentSelection;
  args.state.dragStartPoint = next.dragStartPoint;
  args.state.currentState = next.currentState;
}

export function updateSelectionModeDragSelection(
  args: SelectionModeRuntimeActionsArgs,
  currentX: number,
  currentY: number
): void {
  args.state.currentSelection = getDragSelectionRuntime(args).updateDragSelection(
    currentX,
    currentY
  );
  updateSelectionModeDragFrame(args);
}

export function finalizeSelectionModeDragSelection(args: SelectionModeRuntimeActionsArgs): void {
  const next = getDragSelectionRuntime(args).finalizeDragSelection();
  args.state.currentState = next.currentState;
  args.state.aspectRatio = next.aspectRatio;
  args.state.skipNextClick = next.skipNextClick;

  if (next.shouldShowFinalFrame) {
    args.showFinalFrame();
  }
}

export function resetSelectionModeToIdleState(args: SelectionModeRuntimeActionsArgs): void {
  const next = getDragSelectionRuntime(args).resetToIdleState();
  args.state.currentSelection = next.currentSelection;
  args.state.aspectRatio = next.aspectRatio;
  args.state.maintainAspectRatio = next.maintainAspectRatio;
  args.state.isDragging = next.isDragging;
  args.state.isResizing = next.isResizing;
  args.state.resizeDirection = next.resizeDirection;
  args.state.hoveredElement = next.hoveredElement;
  args.state.mouseDownPoint = next.mouseDownPoint;
  args.state.hasMovedEnough = next.hasMovedEnough;
  args.state.currentState = next.currentState;
}

export function constrainSelectionModeSelection(args: SelectionModeRuntimeActionsArgs): void {
  args.state.currentSelection = getDragSelectionRuntime(args).constrainSelection();
}

export function updateSelectionModeFinalFrame(args: SelectionModeRuntimeActionsArgs): void {
  getDragSelectionRuntime(args).updateFinalFrame();
}

export function handleSelectionModeDragMove(
  args: SelectionModeRuntimeActionsArgs,
  event: MouseEvent
): void {
  args.state.currentSelection = getDragSelectionRuntime(args).handleDragMove(event);
  constrainSelectionModeSelection(args);
  args.updateFinalFrame();
}

export function handleSelectionModeResizeMove(
  args: SelectionModeRuntimeActionsArgs,
  event: MouseEvent
): void {
  if (!args.state.resizeDirection) {
    return;
  }

  args.state.currentSelection = getDragSelectionRuntime(args).handleResizeMove(event);
  constrainSelectionModeSelection(args);
  args.updateFinalFrame();
}
