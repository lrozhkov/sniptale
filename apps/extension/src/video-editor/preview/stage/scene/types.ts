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
import type React from 'react';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';

import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { PreviewStageVideoRefs } from '../types';
import type { PreviewEffectRuntimeFeedback } from '../types';
import type { VideoEditorPreviewRasterSize } from '../sizing/raster';
import type { VideoEditorPreviewMode } from '../../../contracts/preview-runtime';
import type { VideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';

export interface PreviewStageCanvasSceneParams {
  activeClips: VideoProjectClip[];
  assetUrls?: Record<string, string>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
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
  project: VideoProject;
  renderGeneration?: number;
  renderGenerationRef?: React.MutableRefObject<number> | undefined;
  stageRef: React.RefObject<HTMLDivElement | null>;
  videoRefs: PreviewStageVideoRefs;
}

type PreviewEffectRuntimeExecutorInput =
  | EffectRuntimeSandboxExecutor
  | (() => EffectRuntimeSandboxExecutor);

/** Camera evaluated for one completed frame; the outer caller owns visible publication. */
export interface PreviewScenePresentation {
  camera: VideoCompositionCameraState;
  time: number;
}

export type PreviewSceneRenderInput = {
  gpuPreview?: NativeGpuPreviewRenderer;
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

/** GPU output is optional: undefined delegates the complete frame to the existing renderer. */
export interface NativeGpuPreviewRenderer {
  readonly acceptsNativeFrames?: boolean;
  render(
    input: PreviewSceneRenderInput,
    passes: ReturnType<typeof resolveVideoCompositionRenderPasses>,
    finish: (prepared: PreparedPreviewSceneCanvas, phase?: 'borders' | 'final') => void,
    isInvalidated: () => boolean,
    effects?:
      | EffectRuntimeRenderedComposition
      | ((
          composeInput: EffectRuntimeInputComposer
        ) => Promise<EffectRuntimeRenderedComposition | undefined>),
    /** Omission conservatively retains the raster for callers without producer admission. */
    finalArtworkRequired?: boolean
  ): Promise<boolean | undefined>;
  dispose(): void;
}
