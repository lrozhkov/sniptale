import type { ReviewVisualPlacement } from '../visual-anchor';
/** Canonical plane fractions; rotation is clockwise radians around the body centre. */
export interface ReviewAnnotationEffectTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Source-time annotation independent from the catalog and disposable timeline rows. */
export interface ReviewAnnotationEffect extends ReviewVisualPlacement {
  id: string;
  snapshotId: string;
  enabled: boolean;
  start: number;
  end: number;
  timeDomain?: 'result';
  attachment: 'content' | 'viewport';
  transform: ReviewAnnotationEffectTransform;
  controls: Record<string, string | number>;
  /** Canonical scene anchors; whole-object transforms carry them, while handle edits remain independent. */
  anchors?: Record<string, { x: number; y: number }>;
  order: number;
}

/** Authored lane; disabled content remains editable and retained by history. */
export interface ReviewAnnotationEffects {
  enabled: boolean;
  instances: ReviewAnnotationEffect[];
}

/** JSON resource descriptor; bytes belong to the existing project-asset authority. */
export interface ReviewAnnotationEffectAsset {
  id: string;
  assetId: string;
  kind: 'image' | 'svg';
  mimeType: string;
  byteLength: number;
  sha256: string;
}

/** Immutable verified source outside history; history stores snapshot identities only. */
export interface ReviewAnnotationEffectSnapshot {
  id: string;
  schemaVersion: 'sniptale.animation.v1';
  kind: 'standalone';
  documentId: string;
  sha256: string;
  source: string;
  retainedByteLength: number;
  assets: ReviewAnnotationEffectAsset[];
}
