import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';

export interface SelectionModeFinalElementsOptions {
  zIndexBase: number;
  overlayBackground: string;
  visual: ResolvedBorderPresetVisual;
  minSelectionSize: number;
  getMaxSelectionWidth: () => number;
  getMaxSelectionHeight: () => number;
  onConfirm: () => void;
  onResetToIdle: () => void;
  onSetupSizePanelListeners: () => void;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
