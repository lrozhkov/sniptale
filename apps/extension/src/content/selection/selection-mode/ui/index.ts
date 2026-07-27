import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { createSelectionModeFinalElements } from './final-elements';
import { createSelectionModeDragOverlay } from './final-elements/overlay';
import { hideSelectionModeCancelButton } from './cancel-button';
import type { SelectionModeDom } from './dom-types';
import { getSelectionDragFrameStyle } from './style';
import type { SelectionModeFinalElementsOptions } from './types';
export {
  cancelScheduledDragFrameUpdate,
  cancelScheduledFinalFrameUpdate,
  cleanupSelectionModeDom,
  flushScheduledFinalFrameUpdate,
  resetFinalElements,
  scheduleFinalFrameUpdate,
  updateDragFrame,
  updateFinalFrame,
  scheduleDragFrameUpdate,
} from './frame-updates';
export type { ResizeDirection } from './dom-types';
export { createOverlayContainer, createSelectionModeDom } from './container';
export { createHoverElements, hideHoverFrame, showHoverFrame } from './hover';

export function createDragFrame(dom: SelectionModeDom, visual: ResolvedBorderPresetVisual): void {
  if (!dom.overlayContainer || dom.dragFrame) return;

  const dragFrame = document.createElement('div');
  const dragOverlay = createSelectionModeDragOverlay(
    dom.dragMaskBackground ?? 'rgba(0, 0, 0, 0.45)'
  );
  dragFrame.className = 'sniptale-selection-drag-frame';
  dragFrame.style.cssText = getSelectionDragFrameStyle(visual);

  dom.overlayContainer.append(dragOverlay, dragFrame);
  dom.dragFrame = dragFrame;
  dom.dragOverlay = dragOverlay;
}

export function createDragEventCatcher(dom: SelectionModeDom, zIndexBase: number): void {
  if (dom.dragEventCatcher || !dom.overlayContainer) return;

  const dragEventCatcher = document.createElement('div');
  dragEventCatcher.className = 'sniptale-selection-drag-event-catcher';
  dragEventCatcher.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: auto;
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    z-index: ${zIndexBase - 1};
  `;

  dom.overlayContainer.appendChild(dragEventCatcher);
  dom.dragEventCatcher = dragEventCatcher;
}

export function removeDragEventCatcher(dom: SelectionModeDom): void {
  dom.dragEventCatcher?.remove();
  dom.dragEventCatcher = null;
}

export function createFinalElements(
  dom: SelectionModeDom,
  options: SelectionModeFinalElementsOptions
): void {
  createSelectionModeFinalElements(dom, options);
  hideSelectionModeCancelButton(dom);
}
