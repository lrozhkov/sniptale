import type { Selection } from '../../../types';
import { bindDimensionInput } from './dimension-commit';
import { resizeSelectionHeight } from './resize-core';
import type { InputBindingOptions } from './types';

export function bindSelectionHeightInput(
  heightInput: HTMLInputElement,
  widthInput: HTMLInputElement,
  syncSelection: (selection: Selection) => void,
  options: InputBindingOptions
): void {
  bindDimensionInput({
    input: heightInput,
    pairedInput: widthInput,
    maxValue: options.maxHeight,
    minSelectionSize: options.minSelectionSize,
    getSelection: options.getCurrentSelection,
    getCurrentValue: (selection) => selection.height,
    getShouldSyncPairedInput: () =>
      options.getMaintainAspectRatio() && Boolean(options.getAspectRatio()),
    getPairedValue: (selection) => selection.width,
    apply: (selection, value) =>
      resizeSelectionHeight(selection, {
        nextValue: value,
        minSelectionSize: options.minSelectionSize,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        maintainAspectRatio: options.getMaintainAspectRatio(),
        aspectRatio: options.getAspectRatio(),
      }),
    syncSelection,
  });
}
