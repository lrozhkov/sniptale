import type { VideoCompositionTimelineIndex } from '../../features/video/composition/timeline/frame/index';
import type { VideoCompositionMediaSource } from '../../features/video/composition/draw/media-source';
import type { OffscreenProjectEffectRuntime } from './effect-runtime';
import type { LoadedImagesMap } from './renderer/types';
import type { ExportSceneBackgroundCache } from './renderer/background';
import type { ProjectExportSourceSampling } from './renderer/source-sampling';
import type { VideoProject } from '../../features/video/project/types/model';
import type { VideoProjectExportSettings } from '../../features/video/project/types/export';
import type { VideoProjectCompositionJoinPlan } from '../../features/video/project/scene/joins-types';
import type { VideoProjectWatermarkRenderer } from '../../features/video/composition/canvas/project-watermark';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import type { ExportTimeEstimator } from '../../features/video/project/export/time-estimate';
import type { ExportAudioSettings } from './codecs/types';
import { type ClipAudioNode } from './media';
import type { VideoProjectCaptionRenderer } from '../../workflows/video-review/project-captions';
import type { createRecordingCursorTrajectoryRenderer } from '../../workflows/video-review/cursor-trajectory';
import type { createRecordingEventsRenderer } from '../../workflows/video-review/recording-events';

/** The existing job owns the immutable endpoints and borrowed-URL paused decoders. */
export interface ProjectExportCompositionJoinRenderer {
  project: VideoProject;
  settings: VideoProjectExportSettings;
  clear(): void;
  dispose(): void;
  draw(
    context: CanvasRenderingContext2D,
    plan: VideoProjectCompositionJoinPlan | undefined,
    time: number,
    signal: AbortSignal
  ): Promise<void>;
}

export interface ProjectExportRuntimeState {
  sharedComposition?: SharedProjectExportComposition;
  sourceSampling?: ProjectExportSourceSampling;
  compositionJoinRenderer?: ProjectExportCompositionJoinRenderer;
  cameraSpatialRenderer?: ReviewSpatialRenderer;
  captionRenderer?: VideoProjectCaptionRenderer;
  cursorTrajectoryRenderer?: ReturnType<typeof createRecordingCursorTrajectoryRenderer>;
  recordingEventsRenderer?: ReturnType<typeof createRecordingEventsRenderer>;
  watermarkRenderer?: VideoProjectWatermarkRenderer;
  mediaRecorder: MediaRecorder | null;
  clipMediaElements: Map<string, HTMLMediaElement>;
  clipAudioNodes: Map<string, ClipAudioNode>;
  audioContext: AudioContext | null;
  audioDestination: MediaStreamAudioDestinationNode | null;
  exportAudioSettings: ExportAudioSettings | null;
  assetUrls: string[];
  cleanupNode: HTMLDivElement | null;
  exportAbortController: AbortController | null;
  exportStream: MediaStream | null;
}

export interface ExportJobState extends ProjectExportRuntimeState {
  jobId: string;
  cancelled: boolean;
  timeEstimator?: ExportTimeEstimator;
  renderProgressRange?: { start: number; end: number };
}

export interface ProjectCompositionSceneInput {
  context: CanvasRenderingContext2D;
  currentTime: number;
  captionSampleTime?: number;
  sourceSamplingFallback?: 'first' | 'last';
  job: Pick<
    ExportJobState,
    | 'sourceSampling'
    | 'cancelled'
    | 'cameraSpatialRenderer'
    | 'captionRenderer'
    | 'watermarkRenderer'
    | 'cursorTrajectoryRenderer'
    | 'recordingEventsRenderer'
  >;
  loadedImages: LoadedImagesMap;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  ownerDocument?: Document;
  compositionIndex?: VideoCompositionTimelineIndex;
  effectRuntime?: OffscreenProjectEffectRuntime;
  backgroundCache?: ExportSceneBackgroundCache;
}

export type SharedProjectCompositionInput = ProjectCompositionSceneInput & {
  job: ProjectCompositionSceneInput['job'] & Pick<ProjectExportRuntimeState, 'sharedComposition'>;
};
export interface SharedProjectExportComposition {
  readonly project: SharedProjectCompositionInput['project'];
  readonly settings: SharedProjectCompositionInput['settings'];
  render(input: SharedProjectCompositionInput): Promise<void>;
  dispose(): void;
}
