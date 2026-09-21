import type { Paint } from '@sniptale/foundation/paint';
import type { ReviewSpeedRate } from './speed';

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
  ({ kind: 'cut' } | { kind: 'speed'; rate: ReviewSpeedRate; audio: 'speed' | 'mute' });

export interface ReviewDocument {
  annotations: ReviewAnnotation[];
  edits: ReviewEdit[];
  canvasComments: CanvasComment[];
  /** Derived advanced content; history `advancedContent` operations replay onto the baseline. */
  advancedContent: import('./advanced/types').QuickEditAdvancedContent;
}

/**
 * Overlay comment pinned to the final frame; times are seconds on the original video.
 * Content positions are normalized to the padded content area so zoom drags them along;
 * viewport positions are normalized to the output canvas and ignore the camera.
 * `annotationId` links an overlay to a saved annotation: the annotation owns the text,
 * the overlay only references it, so both stay one source of truth.
 */
export interface CanvasComment {
  id: string;
  annotationId?: string;
  text: string;
  start?: number;
  end?: number;
  visible: boolean;
  renderToVideo: boolean;
  attachment: 'content' | 'viewport';
  position: { x: number; y: number };
  /** Bubble placement relative to the anchor point; missing means above. */
  placement?: 'above' | 'below';
  /** Bubble surface colors and corner rounding. */
  style: {
    fillPaint: Paint;
    textColor: string;
    radius: number;
    width?: number;
    fontSize?: number;
    padding?: number;
  };
}

/** One user commit; before/after values make linear undo deterministic after a restart. */
export type ReviewOperation = { id: string; at: number } & (
  | { target: 'annotation'; before: ReviewAnnotation | null; after: ReviewAnnotation | null }
  | {
      target: 'edit';
      before: ReviewEdit | null;
      after: ReviewEdit | null;
      /** Commit-time policy; absent on historical operations with fixed result-time focus. */
      preserveFocusAnchors?: true;
      /** Preserves whole voiceover records in source coordinates; playback alone is projected. */
      preserveVoiceoverAnchors?: true;
    }
  | {
      target: 'canvasComment';
      before: CanvasComment | null;
      after: CanvasComment | null;
    }
  | {
      /** Whole-content advanced snapshot; `ui` chrome never travels through history. */
      target: 'advancedContent';
      before: import('./advanced/types').QuickEditAdvancedContent;
      after: import('./advanced/types').QuickEditAdvancedContent;
    }
);

/**
 * One active selection shared by Delete, the inspector, handles, and keyboard
 * navigation; not persistent content. Cut removal and lane deletion resolve
 * through the same owner, so a stale edit never hides behind a newer selection.
 */
export type ReviewSelection =
  | { kind: 'none' }
  | { kind: 'telemetry'; ref: NonNullable<ReviewAnnotation['telemetryRef']> }
  | { kind: 'edit'; id: string }
  | { kind: 'annotation'; id: string }
  | { kind: 'canvas-comment'; id: string }
  | { kind: 'original-audio'; id: string }
  | { kind: 'zoom'; id: string }
  | { kind: 'zoom-link'; id: string }
  | { kind: 'audio'; lane: 'voiceover' | 'music'; id: string };
