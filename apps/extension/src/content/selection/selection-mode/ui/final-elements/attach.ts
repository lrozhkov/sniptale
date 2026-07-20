import type { SelectionModeDom } from '../dom-types';
import type { SelectionModeFinalElementsBundle } from './assemble';
import { wireSelectionModeFinalSizeTooltipActions } from './tooltip';
import type { FinalElementsOptions } from './types';

export function attachSelectionModeFinalElements(
  dom: SelectionModeDom,
  elements: SelectionModeFinalElementsBundle,
  options: FinalElementsOptions
): void {
  dom.finalOverlay = elements.finalOverlay;
  dom.finalFrame = elements.finalFrame;
  dom.scissorsIcon = null;
  dom.sizeTooltip = elements.sizeTooltip;
  dom.sizePanel = elements.sizeTooltip.root;
  dom.widthInput = elements.sizeTooltip.widthInput;
  dom.heightInput = elements.sizeTooltip.heightInput;
  dom.aspectRatioButton = elements.sizeTooltip.aspectRatioButton;

  wireSelectionModeFinalSizeTooltipActions(elements.sizeTooltip, options);
  options.onSetupSizePanelListeners();
}
