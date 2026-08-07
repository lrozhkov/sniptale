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
  /** Additional independently editable callouts. The primary callout remains in `callout`. */
  additionalCallouts?: CalloutSettings[];
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
  const callouts = normalizeCalloutInstanceIds(snapshot);
  return {
    ...snapshot,
    x: normalizeFinite(snapshot.x),
    y: normalizeFinite(snapshot.y),
    width: normalizeNonNegative(snapshot.width),
    height: normalizeNonNegative(snapshot.height),
    ordering: Math.max(0, Math.trunc(normalizeFinite(snapshot.ordering))),
    ...callouts,
  };
}

function normalizeCalloutInstanceIds(
  snapshot: FrameAnnotationSnapshotV1
): Pick<FrameAnnotationSnapshotV1, 'callout' | 'additionalCallouts'> {
  const used = new Set<string>();
  const normalize = (callout: CalloutSettings, index: number): CalloutSettings => {
    const fallback = `${snapshot.id}:callout:${index}`;
    const preferred = callout.instanceId || fallback;
    let instanceId = preferred;
    if (used.has(instanceId)) {
      instanceId = fallback;
      let collision = 1;
      while (used.has(instanceId)) instanceId = `${fallback}:${collision++}`;
    }
    used.add(instanceId);
    return callout.instanceId === instanceId ? callout : { ...callout, instanceId };
  };
  const primary = snapshot.callout ? normalize(snapshot.callout, 0) : undefined;
  const additional = snapshot.additionalCallouts?.map((callout, index) =>
    normalize(callout, index + 1)
  );
  return {
    ...(primary ? { callout: primary } : {}),
    ...(additional ? { additionalCallouts: additional } : {}),
  };
}

function normalizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeNonNegative(value: number): number {
  return Math.max(0, normalizeFinite(value));
}
