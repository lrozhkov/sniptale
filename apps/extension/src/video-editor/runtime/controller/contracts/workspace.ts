import type { VideoProject } from '../../../../features/video/project/types';
export interface VideoEditorShellController {
  error: string | null;
  isReady: boolean;
  project: VideoProject | null;
}
