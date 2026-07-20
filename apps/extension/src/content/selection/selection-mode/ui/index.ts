import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import { createSelectionModeFinalElements, type FinalElementsOptions } from './final-elements';
import { hideSelectionModeCancelButton } from './cancel-button';
import type { SelectionModeDom } from './dom-types';
import { getSelectionDragFrameStyle } from './style';
export {
  cleanupSelectionModeDom,
  resetFinalElements,
  updateDragFrame,
  updateFinalFrame,
} from './frame-updates';
export type { ResizeDirection } from './dom-types';
export { createOverlayContainer, createSelectionModeDom } from './container';
export { createHoverElements, hideHoverFrame, showHoverFrame } from './hover';

export function createDragFrame(
  dom: SelectionModeDom,
  visual: ResolvedBorderPresetVisual,
  overlayBackground: string
): void {
  if (!dom.overlayContainer || dom.dragFrame) return;

  const dragFrame = document.createElement('div');
  dragFrame.className = 'sniptale-selection-drag-frame';
  dragFrame.style.cssText = getSelectionDragFrameStyle(visual, overlayBackground);

  dom.overlayContainer.appendChild(dragFrame);
  dom.dragFrame = dragFrame;
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
    z-index: ${zIndexBase - 1};
  `;

  dom.overlayContainer.appendChild(dragEventCatcher);
  dom.dragEventCatcher = dragEventCatcher;
}

export function removeDragEventCatcher(dom: SelectionModeDom): void {
  dom.dragEventCatcher?.remove();
  dom.dragEventCatcher = null;
}

export function createFinalElements(dom: SelectionModeDom, options: FinalElementsOptions): void {
  createSelectionModeFinalElements(dom, options);
  hideSelectionModeCancelButton(dom);
}
