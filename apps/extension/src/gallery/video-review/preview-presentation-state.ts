import {
  reviewPreviewSceneKey,
  sameReviewPreviewSceneKey,
  type PreviewSceneKey,
} from '../../workflows/video-review/preview-scene';
import type { RefObject } from 'react';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import { resolveQuickPreviewRasterSize } from '../../features/video/preview/raster';
import type { createReviewPreviewRenderer } from '../../workflows/video-review/render-preview';
import type { ReviewCutPreviewBinding } from './cut-transition-preview';
import type { ReviewWebcamStageBinding } from './webcam-overlay';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';

export type Renderer = ReturnType<typeof createReviewPreviewRenderer>;
type Scene = Parameters<Renderer['prepare']>[0];
export type Prepared = Awaited<ReturnType<Renderer['prepare']>>;
export type RenderFrame = Parameters<Renderer['render']>[1];
type Size = { width: number; height: number };

/** Stage geometry and transport remain caller-owned; scene regions already include editor drafts. */
export interface PresentationInput {
  video: RefObject<HTMLVideoElement | null>;
  host: RefObject<HTMLDivElement | null>;
  sourceIdentity: string;
  /** Originating session resources are read within the existing prepare transaction. */
  readAsset?: (reference: string, signal: AbortSignal) => Promise<Blob | null>;
  sourceFrameRate?: number | undefined;
  backgroundPending?: boolean | undefined;
  scene: Scene;
  canonical: Size;
  css: Size;
  preferences: QuickPreviewPreferences;
  playing: boolean;
  interacting?: boolean;
  visible?: boolean;
  seekRevision?: number;
  pausedSourceTime: number;
  pausedResultTime: number;
  sourceToResult(sourceTime: number): number | null;
  cameraTransform?: RenderFrame['cameraTransform'];
  cut?: ReviewCutPreviewBinding | undefined;
  webcam?: ReviewWebcamStageBinding | undefined;
  onStatistics?(status: ReviewPreviewPresentationStatus): void;
}

/** Requested FPS counts completed manual publications; native transport statistics are separate. */
export interface ReviewPreviewPresentationStatus {
  captionConflicts?: Prepared['captionConflicts'];
  phase: 'inactive' | 'pending' | 'ready' | 'failed';
  actualRaster: Size | null;
  presentedFPS: number | null;
  nativeVideoFPS: number | null;
}

export type Description = {
  scene: Scene;
  dimensions: { canonical: Size; backing: Size };
  cameraTransform: RenderFrame['cameraTransform'];
  sourceTime: number;
  fps?: number;
};

export type PresentationCameraState = {
  phase: 'loading' | 'ready' | 'failed';
  duration: number;
  ready: boolean;
};

type StableDescription = {
  key: PreviewSceneKey;
  generation: number;
  description: Description;
};

/** Snapshot drafts and backing together; geometry remains canonical across quality changes. */
export function resolvePresentationDescription(
  input: PresentationInput,
  comments: Record<string, { x: number; y: number }>,
  placement: QuickEditWebcamPlacement | null,
  interacting: boolean,
  previous: StableDescription | null
): StableDescription {
  const scene: Scene = {
    ...input.scene,
    // Live overlays retain burn-in authority so caption admission ignores editor-only comments.
    showEditorComments: true,
    comments: input.scene.comments.map((comment) => ({
      ...comment,
      position: comments[comment.id] ?? comment.position,
    })),
  };
  const key = reviewPreviewSceneKey(scene, [
    input.canonical,
    input.css,
    input.preferences,
    input.sourceFrameRate,
    input.seekRevision,
    input.backgroundPending,
    input.playing,
    interacting,
    !input.playing && input.cameraTransform,
    !input.playing && input.pausedSourceTime,
    !input.playing && input.pausedResultTime,
    placement,
    input.webcam?.editor.crop,
    input.webcam?.editor.placement,
  ]);
  if (!previous || !sameReviewPreviewSceneKey(previous.key, key)) {
    const backing = resolveQuickPreviewRasterSize({
      canonical: input.canonical,
      css: input.css,
      dpr: window.devicePixelRatio || 1,
      rasterPreset: input.preferences.rasterPreset,
      pausedQuality: input.preferences.pausedQuality,
      paused: !input.playing && !interacting,
    });
    return {
      key,
      generation: (previous?.generation ?? 0) + 1,
      description: {
        scene,
        dimensions: { canonical: input.canonical, backing },
        cameraTransform: !input.playing ? input.cameraTransform : undefined,
        sourceTime: input.pausedSourceTime,
        fps:
          input.preferences.frameRate === 'current'
            ? Number.isFinite(input.sourceFrameRate) && (input.sourceFrameRate ?? 0) > 0
              ? input.sourceFrameRate!
              : 30
            : Number(input.preferences.frameRate),
      },
    };
  }
  Object.assign(previous.key, key);
  return previous;
}

export const PREVIEW_STATISTICS_INTERVAL_MS = 500;

function samePresentationMetadata(
  left: ReviewPreviewPresentationStatus,
  right: ReviewPreviewPresentationStatus
) {
  return (
    left.phase === right.phase &&
    left.nativeVideoFPS === right.nativeVideoFPS &&
    left.actualRaster?.width === right.actualRaster?.width &&
    left.actualRaster?.height === right.actualRaster?.height &&
    JSON.stringify(left.captionConflicts ?? []) === JSON.stringify(right.captionConflicts ?? [])
  );
}

/** Gate UI readout updates; explicit statistics consumers still receive every publication. */
export function createPresentationFeedback(
  report: (value: ReviewPreviewPresentationStatus) => void,
  statistics: (value: ReviewPreviewPresentationStatus) => void
) {
  let previous: { status: ReviewPreviewPresentationStatus; at: number } | null = null;
  return (value: ReviewPreviewPresentationStatus) => {
    const now = performance.now();
    const sameMetadata = previous !== null && samePresentationMetadata(previous.status, value);
    const sameFPS = previous?.status.presentedFPS === value.presentedFPS;
    const pendingReadout =
      previous &&
      previous.status.presentedFPS !== null &&
      value.presentedFPS !== null &&
      now - previous.at < PREVIEW_STATISTICS_INTERVAL_MS;
    if (!sameMetadata || (!sameFPS && !pendingReadout)) {
      previous = { status: value, at: now };
      report(value);
    }
    statistics(value);
  };
}

/** Unchanged measurements must not invalidate the surrounding editor controls. */
export function retainPresentationBounds(
  previous: Prepared['watermarkBounds'] | null,
  value: Prepared['watermarkBounds'] | null
) {
  return previous === value ||
    (previous !== null &&
      value !== null &&
      previous.x === value.x &&
      previous.y === value.y &&
      previous.width === value.width &&
      previous.height === value.height)
    ? previous
    : value;
}
