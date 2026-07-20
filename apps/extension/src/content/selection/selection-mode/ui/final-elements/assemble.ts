import { createSelectionModeFinalFrame, createSelectionModeFinalResizeHandles } from './frame';
import { createSelectionModeFinalOverlay } from './overlay';
import { createSelectionModeFinalSizeTooltip } from './tooltip';
import type { FinalElementsOptions } from './types';

export type SelectionModeFinalElementsBundle = {
  finalFrame: HTMLElement;
  finalOverlay: HTMLElement;
  sizeTooltip: ReturnType<typeof createSelectionModeFinalSizeTooltip>;
};

export function assembleSelectionModeFinalElements(
  overlayContainer: HTMLElement,
  options: FinalElementsOptions
): SelectionModeFinalElementsBundle {
  const finalOverlay = createSelectionModeFinalOverlay(options);
  const finalFrame = createSelectionModeFinalFrame(options);
  const sizeTooltip = createSelectionModeFinalSizeTooltip(overlayContainer, options);

  createSelectionModeFinalResizeHandles(finalFrame, options.visual.strokeColor);

  overlayContainer.appendChild(finalOverlay);
  overlayContainer.appendChild(finalFrame);

  return {
    finalFrame,
    finalOverlay,
    sizeTooltip,
  };
}
