import type { EffectRuntimeGpuPreparedComposition } from '../../../../features/video/composition/effect-runtime/runtime/types';
import type { EffectRuntimeInputComposer } from '../../../../features/video/composition/effect-runtime/frame/inputs';
import type { EffectRuntimeRenderedComposition } from '../../../../features/video/composition/effect-runtime';
import type { VideoCompositionFrame } from '../../../../features/video/composition/types';
import type { VideoCompositionFrameSource } from '../../../../features/video/composition/draw/media-source';
import type { VideoProjectWatermarkRenderer } from '../../../../features/video/composition/canvas/project-watermark';
import type { VideoProjectCaptionRenderer } from '../../../../workflows/video-review/project-captions';
import type { ReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';
import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { PreparedPreviewSceneCanvas } from './canvas';
import type {
  GpuPreviewRenderer,
  GpuPreviewPresentationSurface,
} from '../../../../features/video/composition/canvas/gpu-preview';
import type React from 'react';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';

import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { PreviewStageVideoRefs } from '../types';
import type { PreviewEffectRuntimeFeedback } from '../types';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';
import type {
  VideoEditorPreviewMode,
  NativePreviewGpuOutput,
} from '../../../contracts/preview-runtime';
export type {
  NativePreviewGpuOutput,
  PreviewScenePresentation,
} from '../../../contracts/preview-runtime';
import type { VideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import type {
  PreviewRendererStatus,
  VideoPreviewRenderer,
} from '../../../../features/video/preview/preferences';

export interface PreviewStageCanvasSceneParams {
  /** Admission uses the requested clock time, including requests between React commits. */
  canRenderCursorFrame?: ((time: number) => boolean) | undefined;
  activeClips: VideoProjectClip[];
  assetUrls?: Record<string, string>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The mounted frontend owns this presenter; each render job captures its current lifetime. */
  framePresenterRef?: React.RefObject<NativePreviewFramePresenter | null>;
  currentTime: number;
  /** Borrows the mounted renderer's playback request until its cleanup runs. */
  registerPlaybackRequest?: ((request: (time: number) => void) => () => void) | undefined;
  onCameraPresented?: ((camera: VideoCompositionCameraState, time: number) => void) | undefined;
  effectRuntimeFeedback: PreviewEffectRuntimeFeedback;
  imageBank: Record<string, HTMLImageElement>;
  isPlaying?: boolean;
  previewCacheBypass?: boolean;
  previewExactFrameCache?: VideoPreviewExactFrameCache;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  previewMode?: VideoEditorPreviewMode;
  previewRenderer?: VideoPreviewRenderer;
  project: VideoProject;
  renderGeneration?: number;
  renderGenerationRef?: React.MutableRefObject<number> | undefined;
  stageRef: React.RefObject<HTMLDivElement | null>;
  videoRefs: PreviewStageVideoRefs;
}

/** The producer exclusively owns this destination through GPU completion. */
export interface NativePreviewGpuTarget extends NativePreviewGpuOutput {
  readonly surface: GpuPreviewPresentationSurface;
}

/** Acquires a hidden exclusive destination bound to the supplied backend. */
export type NativePreviewGpuTargetFactory = (
  size: { width: number; height: number },
  renderer: GpuPreviewRenderer
) => NativePreviewGpuTarget;

/** Visibility and matching geometry commit together in the mounted frontend. */
export interface NativePreviewFramePresenter {
  acquire: NativePreviewGpuTargetFactory;
  publish(output: NativePreviewGpuOutput | null, acceptGeometry: () => void): void;
}

type PreviewEffectRuntimeExecutorInput =
  | EffectRuntimeSandboxExecutor
  | (() => EffectRuntimeSandboxExecutor);

/** Geometry and effect plans use one composition time; source timestamps retain their own authority. */
interface PreviewSceneFramePlan {
  readonly passes: ReturnType<typeof resolveVideoCompositionRenderPasses>;
  readonly effects?: EffectRuntimeGpuPreparedComposition;
  readonly rasterScale: number;
  readonly compositionTime: number;
  readonly sourcePresentation: ReadonlyMap<
    string,
    { timestampUs: number; durationUs: number | null }
  >;
}

export type PreviewSceneRenderInput = {
  /** Borrowed preparation; its caller releases it after render completion. */
  preparedFrame?: PreviewSceneFramePlan;
  /** Final GPU work was submitted; publication and source release still await completion. */
  onGpuSubmitted?: () => void;
  previewRenderer?: VideoPreviewRenderer;
  gpuPreview?: NativeGpuPreviewRenderer;
  acquireGpuOutput?: NativePreviewGpuTargetFactory;
  /** UI publication sends the frame event after pixels and geometry commit. */
  deferFrameEvent?: boolean;
  /** Held composition samples exclude outer fades; their caller applies presentation once. */
  sceneEdges?: 'omit';
  /** Output sampling for size estimation; absence retains the project cadence. */
  sampleFps?: number;
  watermarkRenderer?: VideoProjectWatermarkRenderer;
  cameraOverride?: VideoCompositionCameraState;
  canvas: HTMLCanvasElement;
  captionRenderer?: VideoProjectCaptionRenderer;
  /** The preview runtime owns this reusable transaction canvas. */
  stagingCanvas?: () => HTMLCanvasElement;
  spatialRenderer?: () => ReviewSpatialRenderer;
  currentTime: number;
  /** Complete borrowed source map for composition endpoint sampling. */
  assetUrls?: Record<string, string>;
  imageBank: Record<string, HTMLImageElement>;
  /** The media owner prepares dependencies from this same plan before any raster work. */
  prepareImages?: (frames: readonly VideoCompositionFrame[]) => Promise<void>;
  effectRuntimeExecutor?: PreviewEffectRuntimeExecutorInput;
  isPlaybackFrame?: boolean;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  previewCacheBypass?: boolean;
  previewMode?: VideoEditorPreviewMode;
  renderRevision?: Promise<string>;
  project: VideoProject;
  signal?: AbortSignal;
  stage: HTMLDivElement | null;
  videoRefs: PreviewStageVideoRefs;
  /** Borrowed immutable decoded frames for bounded cut sampling. */
  decodedVideoFrames?: ReadonlyMap<string, VideoCompositionFrameSource>;
};

/** A preparation owns its captured inputs until the sole render consumer completes. */
export interface PreviewScenePreparedFrame {
  readonly input: PreviewSceneRenderInput;
  release(): void;
}

/** GPU output is optional: undefined delegates the complete frame to the existing renderer. */
export interface NativeGpuPreviewRenderer {
  readonly fallbackReason?: PreviewRendererStatus['fallback'];
  readonly acceptsNativeFrames?: boolean;
  render(
    input: PreviewSceneRenderInput,
    passes: ReturnType<typeof resolveVideoCompositionRenderPasses>,
    finish: (prepared: PreparedPreviewSceneCanvas, phase?: 'borders' | 'final') => void,
    isInvalidated: () => boolean,
    effects?:
      | EffectRuntimeRenderedComposition
      | EffectRuntimeGpuPreparedComposition
      | ((
          composeInput: EffectRuntimeInputComposer
        ) => Promise<
          EffectRuntimeRenderedComposition | EffectRuntimeGpuPreparedComposition | undefined
        >),
    /** Omission conservatively retains the raster for callers without producer admission. */
    finalArtworkRequired?: boolean
  ): Promise<boolean | NativePreviewGpuOutput | undefined>;
  dispose(): void;
}
