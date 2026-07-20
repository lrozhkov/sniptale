import type { Selection } from '../../types';
import type { ResizeDirection } from '../../ui';
import {
  constrainSelection as constrainSelectionState,
  finalizeDragSelection as finalizeDragSelectionState,
  handleDragMove as handleDragMoveState,
  handleResizeMove as handleResizeMoveState,
  resetToIdleState as resetToIdleStateState,
  selectElement as selectElementState,
  startDragSelection as startDragSelectionState,
  updateDragFrame as updateDragFrameState,
  updateDragSelection as updateDragSelectionState,
  updateFinalFrame as updateFinalFrameState,
} from '../selection';

function createResizeSelectionMoveArgs(
  args: Parameters<typeof applySelectionModeDragSelection>[0]
) {
  return {
    selectionAtDragStart: args.selectionAtDragStart,
    dragStartPoint: args.dragStartPoint,
    resizeDirection: args.resizeDirection ?? 'se',
    maintainAspectRatio: args.maintainAspectRatio,
    aspectRatio: args.aspectRatio,
    minSelectionSize: args.minSelectionSize,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
  };
}

function startSelectionModeDragSelectionWithFrame(
  args: Parameters<typeof applySelectionModeDragSelection>[0],
  startX: number,
  startY: number
) {
  args.createDragFrame();
  return startDragSelectionState({ dom: args.dom, zIndexBase: args.zIndexBase }, startX, startY);
}

export function applySelectionModeDragSelection(args: {
  createDragFrame: () => void;
  currentSelection: Selection;
  dom: Parameters<typeof updateDragFrameState>[0];
  dragStartPoint: { x: number; y: number };
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  resizeDirection: ResizeDirection | null;
  selectionAtDragStart: Selection;
  maintainAspectRatio: boolean;
  aspectRatio: number | null;
  zIndexBase: number;
}) {
  return {
    constrainSelection: () => constrainSelectionState(args.currentSelection),

    finalizeDragSelection: () =>
      finalizeDragSelectionState({
        dom: args.dom,
        currentSelection: args.currentSelection,
        minSelectionSize: args.minSelectionSize,
      }),

    handleDragMove: (event: MouseEvent) =>
      handleDragMoveState(args.selectionAtDragStart, args.dragStartPoint, event),

    handleResizeMove: (event: MouseEvent) =>
      handleResizeMoveState({
        ...createResizeSelectionMoveArgs(args),
        event,
      }),

    resetToIdleState: () => resetToIdleStateState(args.dom),

    startDragSelection: (startX: number, startY: number) =>
      startSelectionModeDragSelectionWithFrame(args, startX, startY),

    updateDragFrame: () => updateDragFrameState(args.dom, args.currentSelection),
    updateDragSelection: (currentX: number, currentY: number) =>
      updateDragSelectionState(args.dragStartPoint, currentX, currentY),
    updateFinalFrame: () => updateFinalFrameState(args.dom, args.currentSelection),
  };
}

export function applySelectionModeElementSelection(args: {
  element: HTMLElement;
  getAbsolutePosition: (element: HTMLElement) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
}) {
  return selectElementState({
    element: args.element,
    getAbsolutePosition: args.getAbsolutePosition,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
  });
}
