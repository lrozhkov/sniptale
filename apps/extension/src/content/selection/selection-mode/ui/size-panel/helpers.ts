import { syncContentSizeTooltipAspectRatioButtonState } from '@sniptale/ui/content-size-tooltip/dom';
import type { Selection } from '../../types';
import { resizeSelectionHeight, resizeSelectionWidth } from './inputs';

export function createSelectionSync(
  setCurrentSelection: (selection: Selection) => void,
  constrainSelection: () => void,
  updateFinalFrame: () => void
) {
  return (selection: Selection): void => {
    setCurrentSelection(selection);
    constrainSelection();
    updateFinalFrame();
  };
}

export function createAdjustSize(props: {
  aspectRatio: () => number | null;
  getCurrentSelection: () => Selection;
  maintainAspectRatio: () => boolean;
  maxHeight: number;
  maxWidth: number;
  minSelectionSize: number;
  syncSelection: (selection: Selection) => void;
}) {
  return (dimension: 'width' | 'height', delta: number): void => {
    const selection = { ...props.getCurrentSelection() };
    const resize = dimension === 'width' ? resizeSelectionWidth : resizeSelectionHeight;

    props.syncSelection(
      resize(selection, {
        delta,
        minSelectionSize: props.minSelectionSize,
        maxWidth: props.maxWidth,
        maxHeight: props.maxHeight,
        maintainAspectRatio: props.maintainAspectRatio(),
        aspectRatio: props.aspectRatio(),
      })
    );
  };
}

export function bindAspectRatioToggle(
  aspectRatioButton: HTMLButtonElement,
  getCurrentSelection: () => Selection,
  setAspectRatio: (value: number | null) => void,
  setMaintainAspectRatio: (value: boolean) => void,
  getMaintainAspectRatio: () => boolean
) {
  aspectRatioButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const nextMaintainAspectRatio = !getMaintainAspectRatio();
    setMaintainAspectRatio(nextMaintainAspectRatio);
    syncContentSizeTooltipAspectRatioButtonState(aspectRatioButton, {
      maintainAspectRatio: nextMaintainAspectRatio,
    });

    const selection = getCurrentSelection();
    if (nextMaintainAspectRatio && selection.width > 0 && selection.height > 0) {
      setAspectRatio(selection.width / selection.height);
    }
  });
}
