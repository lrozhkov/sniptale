export interface VideoObjectTrackSample {
  time: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible: boolean;
  confidence: number;
}

export interface VideoObjectTrackAnalysisMetadata {
  mode?: 'coarseKeyframes' | 'visualFrames';
  quality?: {
    coverageRatio: number;
    jumpCount: number;
    medianConfidence: number;
    status: 'needsAnchor' | 'unusable' | 'usable';
    visibleSamples: number;
  };
  sourceAssetId: string;
  sourceClipId: string;
  projectStartTime: number;
  projectEndTime: number;
  sampleFps: number;
}

export interface VideoObjectTrackCorrectionAnchor {
  id: string;
  time: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  confidence?: number;
}

export interface VideoObjectTrack {
  id: string;
  kind: 'cursor' | 'visualCursor' | 'object';
  source: 'manual' | 'telemetry' | 'visualDetection';
  detectorVersion?: string;
  hidden?: boolean;
  role?: 'cameraCursor';
  analysis?: VideoObjectTrackAnalysisMetadata;
  correctionAnchors?: VideoObjectTrackCorrectionAnchor[];
  samples: VideoObjectTrackSample[];
}
