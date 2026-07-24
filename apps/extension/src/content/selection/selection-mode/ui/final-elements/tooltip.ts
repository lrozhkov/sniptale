import { createContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import { getSelectionModeSizePanelCopy } from '../constants';
import type { SelectionModeFinalElementsOptions } from '../types';

export function createSelectionModeFinalSizeTooltip(
  mountInto: HTMLElement,
  options: SelectionModeFinalElementsOptions
) {
  return createContentSizeTooltipDom({
    copy: getSelectionModeSizePanelCopy(),
    mountInto,
    widthMin: options.minSelectionSize,
    widthMax: options.getMaxSelectionWidth(),
    heightMin: options.minSelectionSize,
    heightMax: options.getMaxSelectionHeight(),
    maintainAspectRatio: false,
  });
}

export function wireSelectionModeFinalSizeTooltipActions(
  sizeTooltip: ReturnType<typeof createContentSizeTooltipDom>,
  options: SelectionModeFinalElementsOptions
): void {
  sizeTooltip.cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onResetToIdle();
  });
  sizeTooltip.confirmButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onConfirm();
  });
}
