import type React from 'react';

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
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  currentTime: number;
  effectRuntimeFeedback: PreviewEffectRuntimeFeedback;
  imageBank: Record<string, HTMLImageElement>;
  isPlaying?: boolean;
  previewCacheBypass?: boolean;
  previewExactFrameCache?: VideoPreviewExactFrameCache;
  previewRasterSize?: VideoEditorPreviewRasterSize;
  previewMode?: VideoEditorPreviewMode;
  project: VideoProject;
  renderGeneration?: number;
  stageRef: React.RefObject<HTMLDivElement | null>;
  videoRefs: PreviewStageVideoRefs;
}
