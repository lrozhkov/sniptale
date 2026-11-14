import type React from 'react';
import type {
  NativePreviewSourceRuntime,
  PreviewStageVideoRefs,
  PreviewEffectRuntimeFeedback,
} from '../types';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import type { GpuPreviewFramePresenter } from '../../../../features/video/composition/canvas/preview-presentation';
import type {
  VideoPreviewRenderer,
  VideoEditorPreviewMode,
} from '../../../../features/video/preview/preferences';
import type { VideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import type {
  PreviewSceneRenderInput,
  VideoEditorPreviewRasterSize,
} from '../../../../workflows/video/native-composition/types';
export type {
  PreviewSceneRenderInput,
  PreviewSceneSourceFrames,
  PreviewImageResourceDemand,
  PreviewSceneImageResources,
  PreviewScenePreparedFrame,
  NativeGpuPreviewRenderer,
  PreviewScenePresentation,
} from '../../../../workflows/video/native-composition/types';
export interface PreviewStageCanvasSceneParams {
  sourceRuntime?: NativePreviewSourceRuntime;
  /** Admission uses the requested clock time, including requests between React commits. */
  canRenderCursorFrame?: ((time: number) => boolean) | undefined;
  activeClips: VideoProjectClip[];
  assetUrls?: Record<string, string>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The mounted frontend owns this presenter; each render job captures its current lifetime. */
  framePresenterRef?: React.RefObject<GpuPreviewFramePresenter | null>;
  currentTime: number;
  /** Borrows the mounted renderer's playback request until its cleanup runs. */
  registerPlaybackRequest?: ((request: (time: number) => void) => () => void) | undefined;
  onCameraPresented?: ((camera: VideoCompositionCameraState, time: number) => void) | undefined;
  effectRuntimeFeedback: PreviewEffectRuntimeFeedback;
  imageBank: Record<string, HTMLImageElement>;
  prepareImages?: PreviewSceneRenderInput['prepareImages'];
  isPlaying?: boolean;
  previewCacheBypass?: boolean;
  previewExactFrameCache?: VideoPreviewExactFrameCache;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  previewMode?: VideoEditorPreviewMode;
  previewRenderer?: VideoPreviewRenderer;
  project: VideoProject;
  /** Stable authored snapshot, before runtime hydration. */
  effectPreparationProject?: VideoProject | undefined;
  /** One canvas transform gesture; ending it restores strict latest-request cancellation. */
  transformInteraction?: { readonly clipId: string } | undefined;
  renderGeneration?: number;
  renderGenerationRef?: React.MutableRefObject<number> | undefined;
  stageRef: React.RefObject<HTMLDivElement | null>;
  videoRefs: PreviewStageVideoRefs;
}
