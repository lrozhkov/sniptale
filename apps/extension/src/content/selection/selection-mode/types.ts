import type { CaptureActionType } from '../../../contracts/settings';

export type SelectionState = 'idle' | 'hover' | 'drag' | 'confirmed';

export interface SelectionModeActivationOptions {
  captureAction?: CaptureActionType;
  onCaptureActionChange?: (action: CaptureActionType) => void;
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
