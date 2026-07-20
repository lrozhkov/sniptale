import type { LoadedImagesMap } from '../../../renderer';
import type { VideoCompositionTimelineIndex } from '../../../../../features/video/composition/timeline/frame/index';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';
import type { OffscreenProjectEffectRuntime } from '../../../effect-runtime';
import type { RenderLoopJobState } from '../../shared/index';

export type RenderFrameDrivenCompositeFrameArgs = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  currentTime: number;
  frameDurationUs: number;
  frameIndex: number;
  job: RenderLoopJobState;
  loadedImages: LoadedImagesMap;
  effectRuntime?: OffscreenProjectEffectRuntime;
  compositionIndex?: VideoCompositionTimelineIndex;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  timestampOffsetUs?: number;
  throwIfPipelineFailed: () => void;
  videoEncoder: VideoEncoder;
  keyframeInterval: number;
};
