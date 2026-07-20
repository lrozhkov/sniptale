import type { EffectV1Kind } from '@sniptale/runtime-contracts/effect-v1';

export interface VideoProjectEffectSnapshotAsset {
  blob: Blob;
  byteLength: number;
  id: string;
  kind: 'audio' | 'image' | 'svg';
  mimeType: string;
  sha256: string;
}

export interface VideoProjectEffectSnapshot {
  assets: VideoProjectEffectSnapshotAsset[];
  documentId: string;
  id: string;
  kind: EffectV1Kind;
  retainedByteLength: number;
  schemaVersion: 'sniptale.effect.v1';
  sha256: string;
  source: string;
}

export type VideoProjectEffectTarget =
  | { kind: 'scene' }
  | { clipId: string; kind: 'clip' }
  | { kind: 'transition'; transitionId: string };

export interface VideoProjectEffectInstance {
  controls: Record<string, number | string>;
  duration: number;
  enabled: boolean;
  id: string;
  kind: EffectV1Kind;
  playbackRate: number;
  snapshotId: string;
  startTime: number;
  target: VideoProjectEffectTarget;
}
