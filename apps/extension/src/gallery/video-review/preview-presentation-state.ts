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

/** FPS counts completed manual publications; native transport statistics are a separate contract. */
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
};

export type PresentationCameraState = {
  phase: 'loading' | 'ready' | 'failed';
  duration: number;
  ready: boolean;
};

type StableDescription = { key: string; generation: number; description: Description };

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
  const key = JSON.stringify([
    scene,
    input.canonical,
    input.css,
    input.preferences,
    input.seekRevision,
    input.playing,
    interacting,
    !input.playing && input.cameraTransform,
    !input.playing && input.pausedSourceTime,
    !input.playing && input.pausedResultTime,
    placement,
    input.webcam?.editor.crop,
    input.webcam?.editor.placement,
  ]);
  if (previous?.key !== key) {
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
      },
    };
  }
  return previous;
}
