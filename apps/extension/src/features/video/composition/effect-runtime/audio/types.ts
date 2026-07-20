export interface EffectRuntimeAudioPlan {
  assetBlob: Blob;
  assetCacheKey: string;
  assetMimeType: string;
  audioGainEnd: number;
  audioGainStart: number;
  duration: number;
  effectInstanceId: string;
  fadeInMs: number;
  fadeOutMs: number;
  id: string;
  muted: false;
  playbackRate: number;
  snapshotId: string;
  sourceDuration: number;
  sourceKind: 'effect-snapshot';
  sourceStart: number;
  startTime: number;
  volume: number;
  volumeEnvelopeEnd: number;
  volumeEnvelopeStart: number;
}
