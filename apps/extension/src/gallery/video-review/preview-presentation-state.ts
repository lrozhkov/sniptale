import type { ReviewAnnotationMovement } from './annotation-effects-editor';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import type {
  PreviewRendererStatus,
  VideoPreviewRenderer,
} from '../../features/video/preview/preferences';
import type { ReviewPresentedGeometry } from '../../workflows/video-review/gpu-preview-geometry';
import {
  reviewPreviewSceneKey,
  sameReviewPreviewSceneKey,
  type PreviewSceneKey,
} from '../../workflows/video-review/preview-scene';
import type { RefObject } from 'react';
import type { ReviewTransportPosition } from './transport';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import { resolveQuickPreviewRasterSize } from '../../features/video/preview/raster';
import type { createReviewPreviewRenderer } from '../../workflows/video-review/render-preview';
import type { ReviewCutPreviewBinding } from './cut-transition-preview';
import type { ReviewWebcamStageBinding } from './webcam-overlay';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';

export type Renderer = ReturnType<typeof createReviewPreviewRenderer>;
export type PresentedFrame = Awaited<ReturnType<Renderer['renderPresentation']>>;
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
  /** Committed baseline of the one annotation being edited by the active pointer gesture. */
  annotationGesture?: ReviewAnnotationEffect | undefined;
  annotationMovement?: ReviewAnnotationMovement | undefined;
  /** A paused inspector draft retains the displayed frame while its smaller preview renders. */
  deferFrames?: boolean;
  visible?: boolean;
  seekRevision?: number | undefined;
  readPosition?: (() => ReviewTransportPosition) | undefined;
  pausedSourceTime: number;
  pausedResultTime: number;
  sourceToResult(sourceTime: number): number | null;
  cameraTransform?: RenderFrame['cameraTransform'];
  cut?: ReviewCutPreviewBinding | undefined;
  webcam?: ReviewWebcamStageBinding | undefined;
  onGeometry?(
    geometry: ReviewPresentedGeometry | null,
    sourceTime?: number,
    sourceIdentity?: string
  ): void;
  onPresentationActive?(sourceIdentity: string, active: boolean): void;
  onStatistics?(status: ReviewPreviewPresentationStatus): void;
}

/** Requested FPS counts completed manual publications; native transport statistics are separate. */
export interface ReviewPreviewPresentationStatus {
  captionConflicts?: Prepared['captionConflicts'];
  renderer?: PreviewRendererStatus;
  phase: 'inactive' | 'pending' | 'ready' | 'failed';
  actualRaster: Size | null;
  presentedFPS: number | null;
  nativeVideoFPS: number | null;
}

type FrameStatistics = Pick<ReviewPreviewPresentationStatus, 'presentedFPS' | 'nativeVideoFPS'>;

/** Only the mounted FPS output subscribes to this cached readout snapshot. */
export interface ReviewPreviewFrameStatisticsSource {
  read(): FrameStatistics;
  subscribe(listener: () => void): () => void;
}

/** One presentation lifetime owns readout publication and reset. */
export function createPresentationFrameStatistics() {
  let current: FrameStatistics = { presentedFPS: null, nativeVideoFPS: null };
  const listeners = new Set<() => void>();
  const source: ReviewPreviewFrameStatisticsSource = {
    read: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    publish(value: FrameStatistics) {
      if (
        current.presentedFPS === value.presentedFPS &&
        current.nativeVideoFPS === value.nativeVideoFPS
      )
        return;
      current = { presentedFPS: value.presentedFPS, nativeVideoFPS: value.nativeVideoFPS };
      for (const listener of listeners) listener();
    },
  };
}

export type Description = {
  annotationMove?: { instance: ReviewAnnotationEffect; baseline: Scene } | undefined;
  interactionKey?: PreviewSceneKey | undefined;
  renderer?: VideoPreviewRenderer;
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
  const position = input.readPosition?.();
  const context = [
    input.sourceIdentity,
    input.annotationGesture,
    input.canonical,
    input.css,
    input.preferences,
    input.sourceFrameRate,
    input.seekRevision,
    position?.epoch,
    position?.mapRevision,
    input.backgroundPending,
    input.playing,
    input.deferFrames,
    interacting,
    !input.playing && input.cameraTransform,
    !input.playing && input.pausedSourceTime,
    !input.playing && input.pausedResultTime,
    placement,
    input.webcam?.editor.crop,
    input.webcam?.editor.placement,
  ];
  const key = reviewPreviewSceneKey(scene, context);
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
        interactionKey:
          interacting && !input.playing
            ? annotationInteractionKey(scene, input.annotationGesture, context)
            : undefined,
        renderer: input.preferences.renderer,
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

/** Only selected annotation placement/content drafts may differ within one prepared gesture. */
function annotationInteractionKey(
  scene: Scene,
  before: ReviewAnnotationEffect | undefined,
  context: unknown
): PreviewSceneKey | undefined {
  const annotations = scene.annotationEffects;
  if (
    !before ||
    !annotations ||
    !annotations.lane.instances.some((entry) => entry.id === before.id)
  )
    return undefined;
  return reviewPreviewSceneKey(
    {
      ...scene,
      annotationEffects: {
        ...annotations,
        lane: {
          ...annotations.lane,
          instances: annotations.lane.instances.map((entry) => {
            if (entry.id !== before.id) return entry;
            const { anchors: _anchors, ...rest } = entry;
            return {
              ...rest,
              transform: before.transform,
              controls: before.controls,
              ...(before.anchors ? { anchors: before.anchors } : {}),
            };
          }),
        },
      },
    },
    context
  );
}

/** Complete source, camera, raster and unrelated layers must match before retaining an older gesture frame. */
export function canCoalescePresentationInteraction(
  previous: Description,
  next: Description
): boolean {
  return (
    !!previous.interactionKey &&
    !!next.interactionKey &&
    sameReviewPreviewSceneKey(previous.interactionKey, next.interactionKey)
  );
}

export const PREVIEW_STATISTICS_INTERVAL_MS = 500;

function samePresentationMetadata(
  left: ReviewPreviewPresentationStatus,
  right: ReviewPreviewPresentationStatus
) {
  return (
    left.phase === right.phase &&
    left.renderer?.backend === right.renderer?.backend &&
    left.renderer?.fallback === right.renderer?.fallback &&
    left.actualRaster?.width === right.actualRaster?.width &&
    left.actualRaster?.height === right.actualRaster?.height &&
    JSON.stringify(left.captionConflicts ?? []) === JSON.stringify(right.captionConflicts ?? [])
  );
}

/** Gate UI readout updates; explicit statistics consumers still receive every publication. */
export function createPresentationFeedback(
  report: (value: ReviewPreviewPresentationStatus) => void,
  statistics: (value: ReviewPreviewPresentationStatus) => void,
  readout: (value: FrameStatistics) => void
) {
  let previous: { status: ReviewPreviewPresentationStatus; at: number } | null = null;
  return (value: ReviewPreviewPresentationStatus) => {
    const now = performance.now();
    const sameMetadata = previous !== null && samePresentationMetadata(previous.status, value);
    const sameFPS =
      previous?.status.presentedFPS === value.presentedFPS &&
      previous?.status.nativeVideoFPS === value.nativeVideoFPS;
    const pendingReadout =
      previous &&
      ((previous.status.presentedFPS !== null && value.presentedFPS !== null) ||
        (previous.status.nativeVideoFPS !== null && value.nativeVideoFPS !== null)) &&
      now - previous.at < PREVIEW_STATISTICS_INTERVAL_MS;
    if (!sameMetadata || (!sameFPS && !pendingReadout)) {
      previous = { status: value, at: now };
      if (!sameMetadata) report(value);
      readout(value);
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
