import type { Selection } from '../../../types';
import { bindDimensionInput } from './dimension-commit';
import { resizeSelectionWidth } from './resize-core';
import type { InputBindingOptions } from './types';

export function bindSelectionWidthInput(
  widthInput: HTMLInputElement,
  heightInput: HTMLInputElement,
  syncSelection: (selection: Selection) => void,
  options: InputBindingOptions
): void {
  bindDimensionInput({
    input: widthInput,
    pairedInput: heightInput,
    maxValue: options.maxWidth,
    minSelectionSize: options.minSelectionSize,
    getSelection: options.getCurrentSelection,
    getCurrentValue: (selection) => selection.width,
    getShouldSyncPairedInput: () =>
      options.getMaintainAspectRatio() && Boolean(options.getAspectRatio()),
    getPairedValue: (selection) => selection.height,
    apply: (selection, value) =>
      resizeSelectionWidth(selection, {
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
