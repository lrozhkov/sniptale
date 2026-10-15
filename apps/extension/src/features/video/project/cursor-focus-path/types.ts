/** Normalized authored focus geometry; recording facts remain in their immutable sidecar. */
export interface CursorFocusPoint {
  x: number;
  y: number;
}

export interface CursorFocusKey extends CursorFocusPoint {
  id: string;
  time: number;
  /** Present only after an intentional override; untouched derived keys are never persisted. */
  authored?: true;
  /** Mandatory fact-derived anchors remain retained; geometry edits create a manual focus override. */
  anchor: 'manual' | 'movement' | 'click' | 'dwell' | 'boundary';
  interpolation: 'linear' | 'smooth' | 'hold';
  /** Explicit source-normalized Bezier control points, retained even when constrained. */
  incoming?: CursorFocusPoint;
  outgoing?: CursorFocusPoint;
}

export type CursorFocusBinding =
  | { kind: 'project' }
  | { kind: 'recording-source'; recordingId: string; sourceInstanceId: string };

export interface CursorFocusSegment {
  id: string;
  binding: CursorFocusBinding;
  start: number;
  end: number;
  keys: CursorFocusKey[];
}

/** Source seconds and normalized source coordinates survive clip timing edits. */
export interface CursorFocusPath {
  version: 1;
  smoothing: number;
  sensitivity: number;
  mode: 'fixed' | 'follow';
  /** Observation gaps hold the last valid framing; lookahead never crosses a segment. */
  gapPolicy: 'hold';
  segments: CursorFocusSegment[];
}

export interface CursorFocusEvaluation extends CursorFocusPoint {
  segmentId: string;
  constrained: boolean;
}
