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

/** Disposable viewport geometry captured before the selection UI changes page hover state. */
export interface FrozenSelectionGeometry {
  width: number;
  height: number;
  scale: number;
  /** Dense painted regions exceeded the safe browser hit-test budget. */
  areaOnly?: boolean;
  getRect: (element: HTMLElement) => Selection;
  targetAt: (x: number, y: number) => HTMLElement | null;
  assertViewport: () => void;
}

/** One raster and its geometry belong to the same selection session. */
export interface FrozenSelectionFrame {
  dataUrl: string;
  geometry: FrozenSelectionGeometry;
  /** Geometry could not be paired with the raster; only rectangle drawing is safe. */
  areaOnly?: boolean;
}
