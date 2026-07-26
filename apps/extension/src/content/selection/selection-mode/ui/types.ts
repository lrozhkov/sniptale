import type { ResolvedBorderPresetVisual } from '../../../../features/highlighter/style';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { Selection } from '../types';

export interface SelectionModeFinalElementsOptions {
  zIndexBase: number;
  overlayBackground: string;
  visual: ResolvedBorderPresetVisual;
  minSelectionSize: number;
  getMaxSelectionWidth: () => number;
  getMaxSelectionHeight: () => number;
  getCaptureAction: () => CaptureActionType;
  getSelection: () => Selection;
  onConfirm: () => void;
  onAdjustPadding: (direction: 'decrease' | 'increase') => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onResetToIdle: () => void;
  onSetupSizePanelListeners: () => void;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
