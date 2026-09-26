import type { FrozenSelectionFrame } from './frozen';
import type { CaptureActionType } from '../../../contracts/settings';

export type SelectionState = 'idle' | 'hover' | 'drag' | 'confirmed';

export interface SelectionModeActivationOptions {
  frozenFrame?: FrozenSelectionFrame;
  captureAction?: CaptureActionType;
  onCaptureActionChange?: (action: CaptureActionType) => void;
  onConfirmEvent?: (event: Event) => void;
}

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}
