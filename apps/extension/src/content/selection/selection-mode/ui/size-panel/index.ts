import type { Selection } from '../../types';
import type { SelectionModeDom } from '../dom-types';
import { bindSelectionHeightInput, bindSelectionWidthInput } from './inputs';
import { bindAdjustmentButtons } from './buttons';
import { bindAspectRatioToggle, createAdjustSize, createSelectionSync } from './helpers';

export interface SelectionModeSizePanelListenersArgs {
  dom: SelectionModeDom;
  minSelectionSize: number;
  getMaxSelectionWidth: () => number;
  getMaxSelectionHeight: () => number;
  getCurrentSelection: () => Selection;
  setCurrentSelection: (selection: Selection) => void;
  getAspectRatio: () => number | null;
  setAspectRatio: (value: number | null) => void;
  getMaintainAspectRatio: () => boolean;
  setMaintainAspectRatio: (value: boolean) => void;
  constrainSelection: () => void;
  updateFinalFrame: () => void;
}

function bindSizePanelInputs(
  dom: SelectionModeDom,
  syncSelection: (selection: Selection) => void,
  props: {
    getAspectRatio: () => number | null;
    getCurrentSelection: () => Selection;
    getMaintainAspectRatio: () => boolean;
    maxHeight: number;
    maxWidth: number;
    minSelectionSize: number;
  }
) {
  bindSelectionWidthInput(dom.widthInput!, dom.heightInput!, syncSelection, {
    minSelectionSize: props.minSelectionSize,
    maxWidth: props.maxWidth,
    maxHeight: props.maxHeight,
    getCurrentSelection: props.getCurrentSelection,
    getMaintainAspectRatio: props.getMaintainAspectRatio,
    getAspectRatio: props.getAspectRatio,
  });
  bindSelectionHeightInput(dom.heightInput!, dom.widthInput!, syncSelection, {
    minSelectionSize: props.minSelectionSize,
    maxWidth: props.maxWidth,
    maxHeight: props.maxHeight,
    getCurrentSelection: props.getCurrentSelection,
    getMaintainAspectRatio: props.getMaintainAspectRatio,
    getAspectRatio: props.getAspectRatio,
  });
}

function createSizePanelAdjustment(args: SelectionModeSizePanelListenersArgs) {
  const maxWidth = args.getMaxSelectionWidth();
  const maxHeight = args.getMaxSelectionHeight();
  const syncSelection = createSelectionSync(
    args.setCurrentSelection,
    args.constrainSelection,
    args.updateFinalFrame
  );
  const adjustSize = createAdjustSize({
    aspectRatio: args.getAspectRatio,
    getCurrentSelection: args.getCurrentSelection,
    maintainAspectRatio: args.getMaintainAspectRatio,
    maxHeight,
    maxWidth,
    minSelectionSize: args.minSelectionSize,
    syncSelection,
  });

  return { adjustSize, maxHeight, maxWidth, syncSelection };
}

export function setupSelectionModeSizePanelListeners(
  args: SelectionModeSizePanelListenersArgs
): void {
  const { dom } = args;
  const { widthInput, heightInput, aspectRatioButton, sizePanel } = dom;
  if (!widthInput || !heightInput || !aspectRatioButton || !sizePanel) return;

  const step = 10;
  const adjustment = createSizePanelAdjustment(args);

  bindAdjustmentButtons(sizePanel, adjustment.adjustSize, step);
  bindSizePanelInputs(dom, adjustment.syncSelection, {
    getAspectRatio: args.getAspectRatio,
    minSelectionSize: args.minSelectionSize,
    maxWidth: adjustment.maxWidth,
    maxHeight: adjustment.maxHeight,
    getCurrentSelection: args.getCurrentSelection,
    getMaintainAspectRatio: args.getMaintainAspectRatio,
  });

  bindAspectRatioToggle(
    aspectRatioButton,
    args.getCurrentSelection,
    args.setAspectRatio,
    args.setMaintainAspectRatio,
    args.getMaintainAspectRatio
  );
}
