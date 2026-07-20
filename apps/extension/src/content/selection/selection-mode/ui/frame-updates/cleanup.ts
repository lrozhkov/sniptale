import type { SelectionModeDom } from '../dom-types';
import { showSelectionModeCancelButton } from '../cancel-button';

export function resetFinalElements(dom: SelectionModeDom): void {
  dom.finalFrame?.remove();
  dom.finalOverlay?.remove();
  dom.sizePanel?.remove();

  dom.finalFrame = null;
  dom.finalOverlay = null;
  dom.scissorsIcon = null;
  dom.sizePanel = null;
  dom.sizeTooltip = null;
  dom.widthInput = null;
  dom.heightInput = null;
  dom.aspectRatioButton = null;
  showSelectionModeCancelButton(dom);
}

export function cleanupSelectionModeDom(dom: SelectionModeDom): void {
  dom.overlayContainer?.remove();

  dom.overlayContainer = null;
  dom.hoverFrame = null;
  dom.scissorsIcon = null;
  dom.hoverSizeLabel = null;
  dom.dragFrame = null;
  dom.finalFrame = null;
  dom.finalOverlay = null;
  dom.sizePanel = null;
  dom.sizeTooltip = null;
  dom.widthInput = null;
  dom.heightInput = null;
  dom.aspectRatioButton = null;
  dom.cancelButton = null;
  dom.dragEventCatcher = null;
}
