import { createContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import { getSelectionModeSizePanelCopy } from '../constants';
import type { SelectionModeFinalElementsOptions } from '../types';
import { enhanceSelectionModeToolbar } from './toolbar';

export function createSelectionModeFinalSizeTooltip(
  mountInto: HTMLElement,
  options: SelectionModeFinalElementsOptions
) {
  const tooltip = createContentSizeTooltipDom({
    copy: getSelectionModeSizePanelCopy(),
    mountInto,
    widthMin: options.minSelectionSize,
    widthMax: options.getMaxSelectionWidth(),
    heightMin: options.minSelectionSize,
    heightMax: options.getMaxSelectionHeight(),
    maintainAspectRatio: false,
    variant: 'frame-edit',
  });
  enhanceSelectionModeToolbar(tooltip, {
    getCaptureAction: options.getCaptureAction,
    getSelection: options.getSelection,
    onAdjustPadding: options.onAdjustPadding,
    onCaptureActionChange: options.onCaptureActionChange,
    onConfirm: options.onConfirm,
    overlayContainer: mountInto,
  });
  return tooltip;
}

export function wireSelectionModeFinalSizeTooltipActions(
  sizeTooltip: ReturnType<typeof createContentSizeTooltipDom>,
  options: SelectionModeFinalElementsOptions
): void {
  sizeTooltip.cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onCancel();
  });
  sizeTooltip.confirmButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onConfirm();
  });
}
