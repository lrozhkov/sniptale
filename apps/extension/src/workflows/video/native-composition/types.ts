import type { CameraOutputViewport } from '../../../features/video/project/export/output-dimensions';
import type { PreviewSourceDemand, PreviewSourceAcquireOptions } from '../preview-source';
import type { PreparedPreviewSourceLease } from '../preview-html-source';
type NativePreviewSourceRuntime = {
  readonly selected: boolean;
  acquire(
    demands: readonly PreviewSourceDemand[],
    signal: AbortSignal,
    options?: PreviewSourceAcquireOptions
  ): Promise<PreparedPreviewSourceLease | null>;
};
import type {
  GpuPreviewOutput,
  GpuPreviewTargetFactory,
} from '../../../features/video/composition/canvas/preview-presentation';
import type { EffectRuntimeGpuPreparedComposition } from '../../../features/video/composition/effect-runtime/runtime/types';
import type { EffectRuntimeInputComposer } from '../../../features/video/composition/effect-runtime/frame/inputs';
import type { EffectRuntimeRenderedComposition } from '../../../features/video/composition/effect-runtime';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualLayer,
} from '../../../features/video/composition/types';
import type {
  VideoCompositionFrameSource,
  VideoCompositionMediaSource,
} from '../../../features/video/composition/draw/media-source';
import type { EffectRuntimeFramePlan } from '../../../features/video/composition/effect-runtime/runtime/types';
import type { VideoProjectWatermarkRenderer } from '../../../features/video/composition/canvas/project-watermark';
import type { VideoProjectCaptionRenderer } from '../../video-review/project-captions';
import type { ReviewSpatialRenderer } from '../../../features/video/composition/canvas/spatial-renderer';
import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import type { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';

import type { VideoCompositionCameraState } from '../../../features/video/composition/types';

import type {
  VideoProject,
  VideoProjectVideoClip,
  VideoProjectImageClip,
} from '../../../features/video/project/types/index';

import type { VideoEditorPreviewMode } from '../../../features/video/preview/preferences';

import type {
  PreviewRendererStatus,
  VideoPreviewRenderer,
} from '../../../features/video/preview/preferences';

/** A source pass supplies exact demand media and physical effect dimensions. */
interface NativeSceneSourceSampling {
  sourceRasterScaleForDemand(clipId: string, id: string): number | undefined;
  forDemand(id: string): ReadonlyMap<string, VideoCompositionMediaSource>;
  effectMedia(plan: EffectRuntimeFramePlan): ReadonlyMap<string, VideoCompositionMediaSource>;
  renderDimensions(plan: EffectRuntimeFramePlan): { width: number; height: number };
}

/** Exact source bindings belong to this resolved composition, never presentation metadata. */
export interface PreviewSceneSourceFrames {
  sampling?(
    frame: Pick<VideoCompositionFrame, 'visualLayers'>,
    time: number
  ): NativeSceneSourceSampling;
  readonly nominal: ReadonlyMap<string, VideoCompositionFrameSource>;
  readonly bindings: ReadonlyMap<
    string,
    {
      readonly source: VideoCompositionFrameSource;
      readonly target: number;
      readonly timestamp: number;
    }
  >;
  media(
    frame: Pick<VideoCompositionFrame, 'visualLayers'>,
    time: number,
    layers?: readonly VideoCompositionVisualLayer[]
  ): Map<string, VideoCompositionFrameSource>;
  release(): void;
}

type PreviewEffectRuntimeExecutorInput =
  | EffectRuntimeSandboxExecutor
  | (() => EffectRuntimeSandboxExecutor);

/** Resource metadata from one actual frame; no geometry is resampled. */
export interface PreviewImageResourceDemand {
  readonly assets: ReadonlySet<string>;
  readonly headers: ReadonlyMap<string, VideoProjectVideoClip | VideoProjectImageClip>;
}

/** Borrowed immutable image bindings live only for their original render/preparation job. */
export interface PreviewSceneImageResources {
  readonly images: Record<string, HTMLImageElement>;
  readonly bindings: ReadonlyMap<string, HTMLImageElement | undefined>;
  readonly headers: ReadonlySet<string>;
  readonly requiredAssets?: ReadonlySet<string>;
}

/** Geometry and effect plans use one composition time; source timestamps retain their own authority. */
interface PreviewSceneFramePlan {
  readonly sourceFrames?: PreviewSceneSourceFrames;
  readonly gpuIsolated?: boolean;
  readonly passes: ReturnType<typeof resolveVideoCompositionRenderPasses>;
  readonly imageResources?: PreviewSceneImageResources;
  readonly effects?: EffectRuntimeGpuPreparedComposition;
  readonly rasterScale: number;
  readonly compositionTime: number;
  readonly sourcePresentation: ReadonlyMap<
    string,
    { timestampUs: number; durationUs: number | null }
  >;
}

/** Admitted immutable source context; its lifetime spans ordinary playback frames. */
interface NativeEffectPreparationContext {
  /** Authored identity; runtime hydration does not replace this snapshot. */
  readonly project: VideoProject;
  readonly signal: AbortSignal;
}

export type PreviewSceneRenderInput = {
  /** Explicit output geometry; absence retains the mounted preview viewport. */
  sceneOutput?: CameraOutputViewport & { includeSubtitles: boolean };
  /** The execution owner enforces its admission policy before publication. */
  assertCaptions?: (captions: Awaited<ReturnType<VideoProjectCaptionRenderer['prepare']>>) => void;
  readAsset?: (asset: VideoProject['assets'][number]) => Promise<Blob | null>;
  /** Future plan data retains current hydration and cadence, independently of authored identity. */
  effectPreparation?: {
    context: NativeEffectPreparationContext;
    project: VideoProject;
    time: number;
  };
  /** Borrowed preparation; its caller releases it after render completion. */
  preparedFrame?: PreviewSceneFramePlan;
  /** The materializer prepares explicit endpoint sources from these resolved, hydrated poses. */
  prepareSourceFrames?: (
    passes: ReturnType<typeof resolveVideoCompositionRenderPasses>
  ) => Promise<PreviewSceneSourceFrames>;
  /** Final GPU work was submitted; publication and source release still await completion. */
  onGpuSubmitted?: () => void;
  /** Transient scheduler notification; never retained in presentation/cache metadata. */
  onImageResourcesPrepared?: (resources: PreviewSceneImageResources) => void;
  previewRenderer?: VideoPreviewRenderer;
  gpuPreview?: NativeGpuPreviewRenderer;
  /** An admitted GPU job must drain before the scheduler can retry Canvas fallback. */
  gpuOnly?: boolean;
  acquireGpuOutput?: GpuPreviewTargetFactory;
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
  prepareImages?: (frames: readonly VideoCompositionFrame[], signal?: AbortSignal) => Promise<void>;
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
  sourceRuntime?: Pick<NativePreviewSourceRuntime, 'selected' | 'acquire'>;
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
  ): Promise<boolean | GpuPreviewOutput | undefined>;
  dispose(): void;
}

export type PreviewSceneBounds = { width: number; height: number };
export type PreviewSceneViewport = PreviewSceneBounds & {
  offsetX: number;
  offsetY: number;
  scale: number;
};
export type VideoEditorPreviewRasterSize = { width: number; height: number };
export type PreviewStageVideoRefs = { current: Record<string, HTMLVideoElement | null> };
/** Image and geometry belong to the same completed composition. */
export interface PreviewScenePresentation {
  camera: VideoCompositionCameraState;
  time: number;
  renderer?: PreviewRendererStatus;
  output?: GpuPreviewOutput;
}

export interface PreparedPreviewSceneCanvas {
  bounds: PreviewSceneBounds;
  context: CanvasRenderingContext2D;
  dpr: number;
  viewport: PreviewSceneViewport;
}
