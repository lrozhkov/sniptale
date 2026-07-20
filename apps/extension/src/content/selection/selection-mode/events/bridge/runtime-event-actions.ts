import {
  constrainSelectionModeSelection,
  finalizeSelectionModeDragSelection,
  handleSelectionModeDragMove,
  handleSelectionModeResizeMove,
  hideSelectionModeHoverFrame,
  resetSelectionModeToIdleState,
  selectSelectionModeElement,
  showSelectionModeHoverFrame,
  startSelectionModeDragSelection,
  updateSelectionModeDragSelection,
  updateSelectionModeFinalFrame,
} from '../../interaction/actions/runtime';
import { isSelectionModeExtensionUiElement } from '../../runtime';
import type { SelectionModeEventsBridgeRuntimeArgs } from './types';

export function createSelectionModeRuntimeEventActions(
  runtimeArgs: SelectionModeEventsBridgeRuntimeArgs
) {
  return {
    constrainSelection() {
      constrainSelectionModeSelection(runtimeArgs);
    },
    finalizeDragSelection() {
      finalizeSelectionModeDragSelection(runtimeArgs);
    },
    handleDragMove(event: MouseEvent) {
      handleSelectionModeDragMove(runtimeArgs, event);
    },
    handleResizeMove(event: MouseEvent) {
      handleSelectionModeResizeMove(runtimeArgs, event);
    },
    hideHoverFrame() {
      hideSelectionModeHoverFrame(runtimeArgs);
    },
    isExtensionUIElement(target: HTMLElement) {
      return isSelectionModeExtensionUiElement(target);
    },
    resetToIdleState() {
      resetSelectionModeToIdleState(runtimeArgs);
    },
    selectElement(element: HTMLElement, iframe?: HTMLIFrameElement) {
      void iframe;
      selectSelectionModeElement(runtimeArgs, element);
    },
    showHoverFrame(element: HTMLElement, iframe?: HTMLIFrameElement) {
      void iframe;
      showSelectionModeHoverFrame(runtimeArgs, element);
    },
    startDragSelection(startX: number, startY: number) {
      startSelectionModeDragSelection(runtimeArgs, startX, startY);
    },
    updateDragSelection(currentX: number, currentY: number) {
      updateSelectionModeDragSelection(runtimeArgs, currentX, currentY);
    },
    updateFinalFrame() {
      updateSelectionModeFinalFrame(runtimeArgs);
    },
  };
}
