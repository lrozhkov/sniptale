/** Immutable media facts. All review times are seconds on the original video. */
export interface ReviewSource {
  duration: number;
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

/** Coordinates in the oriented intrinsic video, excluding player letterboxing. */
export interface ReviewRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ReviewAnchor =
  | { kind: 'point'; time: number }
  | { kind: 'range'; start: number; end: number };

export interface ReviewAnnotation {
  id: string;
  text: string;
  anchor: ReviewAnchor;
  region?: ReviewRegion;
  telemetryRef?: { kind: 'action' | 'signal' | 'cursor'; id: string };
}

interface ReviewEditRange {
  id: string;
  requestedStart: number;
  requestedEnd: number;
  start: number;
  end: number;
}

export type ReviewEdit = ReviewEditRange &
  ({ kind: 'cut' } | { kind: 'speed'; rate: 1.25 | 1.5 | 2 | 4; audio: 'speed' | 'mute' });

export interface ReviewDocument {
  annotations: ReviewAnnotation[];
  edits: ReviewEdit[];
}

/** One user commit; before/after values make linear undo deterministic after a restart. */
export type ReviewOperation = { id: string; at: number } & (
  | { target: 'annotation'; before: ReviewAnnotation | null; after: ReviewAnnotation | null }
  | { target: 'edit'; before: ReviewEdit | null; after: ReviewEdit | null }
);
