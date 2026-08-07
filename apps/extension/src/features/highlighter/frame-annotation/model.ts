import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '@sniptale/ui/highlighter-style/types';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

export const FRAME_ANNOTATION_SNAPSHOT_VERSION = 1 as const;

export type FrameAnnotationInteractionState = 'idle' | 'hover' | 'editing' | 'resizing';

export interface FrameAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Visual state shared by page preparation, the editor projection, and export. */
export interface FrameAnnotationVisualState extends FrameAnnotationRect {
  id: string;
  effectMode?: EffectMode;
  borderSettings?: AppliedBorderSettings;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
  stepBadge?: StepBadgeSettings;
  callout?: CalloutSettings;
}

/** Canonical, versioned editor/export boundary. It intentionally has no runtime anchors. */
export interface FrameAnnotationSnapshotV1 extends FrameAnnotationVisualState {
  version: typeof FRAME_ANNOTATION_SNAPSHOT_VERSION;
  ordering: number;
}

export type FrameAnnotationSnapshot = FrameAnnotationSnapshotV1;

export function createFrameAnnotationSnapshot(
  frame: FrameAnnotationVisualState,
  ordering: number
): FrameAnnotationSnapshotV1 {
  return normalizeFrameAnnotationSnapshot({
    ...frame,
    version: FRAME_ANNOTATION_SNAPSHOT_VERSION,
    ordering,
  });
}

export function normalizeFrameAnnotationSnapshot(
  snapshot: FrameAnnotationSnapshotV1
): FrameAnnotationSnapshotV1 {
  return {
    ...snapshot,
    x: normalizeFinite(snapshot.x),
    y: normalizeFinite(snapshot.y),
    width: normalizeNonNegative(snapshot.width),
    height: normalizeNonNegative(snapshot.height),
    ordering: Math.max(0, Math.trunc(normalizeFinite(snapshot.ordering))),
  };
}

function normalizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeNonNegative(value: number): number {
  return Math.max(0, normalizeFinite(value));
}
