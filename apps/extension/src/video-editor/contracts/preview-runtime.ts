import type { VideoEditorPreviewMode } from '../../features/video/preview/preferences';

export {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from '../../features/video/preview/preferences';

export type VideoEditorPreviewPhase =
  | 'idle'
  | 'starting'
  | 'live'
  | 'preparing-frame-cache'
  | 'preparing-video-cache'
  | 'cached-frame-playback'
  | 'cached-video-playback'
  | 'paused-preparation'
  | 'recovering';

export type VideoEditorPreviewPrepareOutcome =
  | 'live-ready'
  | 'frame-cache-ready'
  | 'video-cache-ready'
  | 'capacity-limited'
  | 'unavailable'
  | 'failed'
  | 'cancelled';

export interface VideoEditorPreviewStatus {
  completedFrames: number;
  mode: VideoEditorPreviewMode;
  phase: VideoEditorPreviewPhase;
  totalFrames: number;
  outcome?: VideoEditorPreviewPrepareOutcome;
}

interface VideoEditorPreviewPlaybackRange {
  end: number;
  start: number;
}

export interface VideoEditorPreviewPrepareRequest {
  generation: number;
  isPlaying: boolean;
  playbackRange: VideoEditorPreviewPlaybackRange | null;
  reason: 'play' | 'seek';
  signal: AbortSignal;
  time: number;
}

/** Page-local bridge between playback authority and the mounted preview runtime. */
export interface VideoEditorPreviewRuntimePort {
  cancel(generation: number): void;
  prepare(request: VideoEditorPreviewPrepareRequest): Promise<VideoEditorPreviewPrepareOutcome>;
  present(time: number): void;
  settle(time: number): void;
  subscribe(listener: (status: VideoEditorPreviewStatus) => void): () => void;
}
