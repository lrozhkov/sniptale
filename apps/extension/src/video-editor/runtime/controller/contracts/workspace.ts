import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorHeaderController, VideoEditorWorkspaceLayoutController } from './header';
import type { VideoEditorPreviewController } from './preview';
import type { VideoEditorSidebarController } from './sidebar';
import type { VideoEditorTimelineController } from './timeline';

export interface VideoEditorWorkspaceController {
  diagnostics: {
    isOpen: boolean;
    onClose: () => void;
    recordingId: string | null;
  };
  header: VideoEditorHeaderController;
  layout: VideoEditorWorkspaceLayoutController;
  preview: VideoEditorPreviewController;
  sidebar: VideoEditorSidebarController;
  timeline: VideoEditorTimelineController;
}

export interface VideoEditorShellController {
  error: string | null;
  isReady: boolean;
  project: VideoProject | null;
}
