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
  kind: 'standalone';
  retainedByteLength: number;
  schemaVersion: 'sniptale.animation.v1';
  sha256: string;
  source: string;
}

export type VideoProjectEffectTarget =
  | { kind: 'scene' }
  | { kind: 'track'; trackId: string }
  | { kind: 'video-group' }
  | { clipId: string; kind: 'clip' }
  | { kind: 'transition'; transitionId: string };

export interface VideoProjectEffectInstance {
  /** Catalog identity for preferences only; rendering uses immutable snapshots. */
  catalogPackId?: string;
  /** Authoritative logical scene positions; local handle controls are derived at render time. */
  sceneAnchors?: Record<string, { x: number; y: number }>;
  /** Full-owner timing follows the clip; manual interval edits retain their source phase. */
  rangeMode?: 'owner' | 'interval';
  controls: Record<string, number | string>;
  duration: number;
  enabled: boolean;
  id: string;
  kind: 'standalone';
  playbackRate: number;
  /** First retained document time, in seconds. Omission starts at the document beginning. */
  sourceStart?: number;
  snapshotId: string;
  startTime: number;
  target: VideoProjectEffectTarget;
}
