export interface VideoCursorDetectionFrame {
  data: Uint8ClampedArray;
  height: number;
  time: number;
  width: number;
}

export interface VideoCursorDetectionCandidate {
  area: number;
  bounds: VideoCursorDetectionRegion;
  centerX: number;
  centerY: number;
  confidence: number;
  contrastScore: number;
  height: number;
  motionScore: number;
  shapeScore: number;
  source: 'anchor' | 'contrast' | 'motion';
  staticPenalty: number;
  time: number;
  width: number;
  x: number;
  y: number;
}

export interface VideoCursorDetectionRegion {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CursorCandidateDetectionOptions {
  maxComponentArea?: number;
  maxCursorSize?: number;
  maxCandidates?: number;
  maxDarkLuma?: number;
  minBrightLuma?: number;
  minComponentArea?: number;
  minConfidence?: number;
  roi?: VideoCursorDetectionRegion;
}

export interface VideoCursorDetectionAnchor {
  confidence?: number;
  height?: number;
  time: number;
  width?: number;
  x: number;
  y: number;
}

export interface VisualCursorTrackDetectionOptions {
  anchorTimeToleranceSeconds?: number;
  detection?: CursorCandidateDetectionOptions;
  manualAnchors?: readonly VideoCursorDetectionAnchor[];
  minConfidence?: number;
  smoothing?: number;
  trackId?: string;
}
