import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { PreviewStageInteractionHandler, PreviewStageVideoRefs } from '../types';

export interface PreviewClipRendererParams {
  assetUrls: Record<string, string>;
  clip: VideoProjectClip;
  currentTime: number;
  onBeginInteraction: PreviewStageInteractionHandler;
  project: VideoProject;
  selectedClipId: string | null;
  videoRefs: PreviewStageVideoRefs;
}
