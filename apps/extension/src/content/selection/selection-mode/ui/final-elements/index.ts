import type { SelectionModeDom } from '../dom-types';
import type { SelectionModeFinalElementsOptions } from '../types';
import { createSelectionModeFinalFrame, createSelectionModeFinalResizeHandles } from './frame';
import { createSelectionModeFinalOverlay } from './overlay';
import {
  createSelectionModeFinalSizeTooltip,
  wireSelectionModeFinalSizeTooltipActions,
} from './tooltip';

type SelectionModeFinalElementsBundle = {
  finalFrame: HTMLElement;
  finalOverlay: HTMLElement;
  sizeTooltip: ReturnType<typeof createSelectionModeFinalSizeTooltip>;
};

function assembleSelectionModeFinalElements(
  overlayContainer: HTMLElement,
  options: SelectionModeFinalElementsOptions
): SelectionModeFinalElementsBundle {
  const finalOverlay = createSelectionModeFinalOverlay(options);
  const finalFrame = createSelectionModeFinalFrame(options);
  const sizeTooltip = createSelectionModeFinalSizeTooltip(overlayContainer, options);

  createSelectionModeFinalResizeHandles(finalFrame, options.visual.strokeColor);
  overlayContainer.append(finalOverlay, finalFrame);

  return { finalFrame, finalOverlay, sizeTooltip };
}

function attachSelectionModeFinalElements(
  dom: SelectionModeDom,
  elements: SelectionModeFinalElementsBundle,
  options: SelectionModeFinalElementsOptions
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

export function createSelectionModeFinalElements(
  dom: SelectionModeDom,
  options: SelectionModeFinalElementsOptions
): void {
  if (!dom.overlayContainer) return;

  const elements = assembleSelectionModeFinalElements(dom.overlayContainer, options);
  attachSelectionModeFinalElements(dom, elements, options);
}
