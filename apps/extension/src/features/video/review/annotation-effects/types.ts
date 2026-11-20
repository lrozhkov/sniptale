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

export const REVIEW_TEXT_TRANSITIONS = [
  'none',
  'fade',
  'slide',
  'pop',
  'zoom',
  'bounce',
  'wipe',
  'words',
  'letters',
  'tracking',
  'typewriter',
  'blur',
  'cascade',
  'rise',
  'squeeze',
] as const;

export const REVIEW_TEXT_LOOPS = [
  'none',
  'shine',
  'pulse',
  'sway',
  'float',
  'breathe',
  'flicker',
] as const;

export const REVIEW_TEXT_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

type ReviewTextTransitionPreset = (typeof REVIEW_TEXT_TRANSITIONS)[number];
type ReviewTextLoopPreset = (typeof REVIEW_TEXT_LOOPS)[number];
type ReviewTextDirection = (typeof REVIEW_TEXT_DIRECTIONS)[number];

/** Authored timing is preserved when a transition has to fit a shorter render interval. */
export interface ReviewTextTransition {
  preset: ReviewTextTransitionPreset;
  duration: number;
  direction: ReviewTextDirection;
  distance: number;
  stagger: number;
}

/** An optional motion sampled in seconds elapsed since the end of the entrance. */
export interface ReviewTextLoop {
  preset: ReviewTextLoopPreset;
  period: number;
  amount: number;
}

/** Native text on the result clock, in normalized coordinates of the final canvas. */
export interface ReviewAnnotationTextClip {
  id: string;
  enabled: boolean;
  text: string;
  start: number;
  end: number;
  transform: ReviewAnnotationEffectTransform;
  color: string;
  fontSize: number;
  order: number;
  entrance: ReviewTextTransition;
  loop: ReviewTextLoop;
  exit: ReviewTextTransition;
}

/** Authored lane; disabled content remains editable and retained by history. */
export interface ReviewAnnotationEffects {
  enabled: boolean;
  instances: ReviewAnnotationEffect[];
  textClips?: ReviewAnnotationTextClip[];
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

/** Reserves a shared order, compacting exhausted values without changing the stacking order. */
export function prepareReviewAnnotationAppend(
  lane: ReviewAnnotationEffects = { enabled: true, instances: [] }
): { lane: ReviewAnnotationEffects; order: number } {
  const clips = [...lane.instances, ...(lane.textClips ?? [])];
  const order = Math.max(-1, ...clips.map((item) => item.order)) + 1;
  if (Number.isSafeInteger(order)) return { lane, order };

  clips.sort((a, b) => a.order - b.order);
  const orders = new Map(clips.map((clip, index) => [clip.id, index]));
  const reorder = <Clip extends { id: string; order: number }>(clip: Clip): Clip => ({
    ...clip,
    order: orders.get(clip.id) ?? clip.order,
  });
  return {
    lane: {
      ...lane,
      instances: lane.instances.map(reorder),
      ...(lane.textClips ? { textClips: lane.textClips.map(reorder) } : {}),
    },
    order: clips.length,
  };
}
