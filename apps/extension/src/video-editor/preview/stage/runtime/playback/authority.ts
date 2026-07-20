import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { VideoProject } from '../../../../../features/video/project/types';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewPrepareOutcome,
  VideoEditorPreviewStatus,
} from '../../../../contracts/preview-runtime';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';
import type { PlaybackPreviewRuntime } from '../../../../interaction/playback/types';
import type { VideoPreviewExactFrameCache } from '../../../../preview/cache/exact-frame-cache';
import type { PreparedCachedVideoPreview } from '../../../../preview/cache/types';
import type { VideoEditorPreviewRasterSize } from '../../sizing/raster';
import type { PreviewStagePlaybackPrepareState } from './prime';

export interface UsePreviewStagePlaybackPreviewRuntimeParams extends PreviewStagePlaybackPrepareState {
  assetUrls: Record<string, string>;
  renderGenerationRef: MutableRefObject<number>;
  previewExactFrameCache: VideoPreviewExactFrameCache;
  previewMode: VideoEditorPreviewMode;
  onPresentationTime: (time: number) => void;
  playbackRange: VideoEditorPlaybackRange | null;
  previewRasterSize: VideoEditorPreviewRasterSize;
  project: VideoProject;
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
}

export interface PreviewRuntimeAuthority {
  activePreparationRef: MutableRefObject<AbortController | null>;
  configurationRevisionRef: MutableRefObject<number>;
  generationRef: MutableRefObject<number>;
  latestStateRef: MutableRefObject<UsePreviewStagePlaybackPreviewRuntimeParams>;
  listenersRef: MutableRefObject<Set<(status: VideoEditorPreviewStatus) => void>>;
  previewStatusRef: MutableRefObject<VideoEditorPreviewStatus>;
  publishStatus(status: VideoEditorPreviewStatus): void;
  setCachedVideo: Dispatch<SetStateAction<PreparedCachedVideoPreview | null>>;
}

export type PreviewAttemptOutcome = VideoEditorPreviewPrepareOutcome | 'retry';
