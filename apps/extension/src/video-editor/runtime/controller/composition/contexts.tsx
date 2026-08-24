import { createContext } from 'react';
import type { VideoEditorLibrariesState } from '../../app-model/types';
import type { VideoEditorCommandHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorWorkspaceState } from '../workspace-state';

type WorkspaceDialogsContextValue = Pick<
  VideoEditorWorkspaceState,
  | 'audioRecordingDialogOpen'
  | 'closeAudioRecordingDialog'
  | 'closeLibraryPanel'
  | 'confirm'
  | 'libraryPanelOpen'
  | 'openAudioRecordingDialog'
  | 'openLibraryPanel'
  | 'toggleLibraryPanel'
>;

type WorkspaceLayoutContextValue = Pick<
  VideoEditorWorkspaceState,
  'leftSidebarCollapsed' | 'toggleSidebarCollapsed'
>;

type WorkspacePlaybackRangeContextValue = Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'playbackRange' | 'setPlaybackRange'
>;

export const WorkspaceDialogsContext = createContext<WorkspaceDialogsContextValue | null>(null);
export const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null);
export const WorkspaceGridContext = createContext<VideoEditorWorkspaceState['grid'] | null>(null);
export const WorkspaceInspectorContext = createContext<
  VideoEditorWorkspaceState['inspector'] | null
>(null);
export const WorkspacePlaybackRangeContext =
  createContext<WorkspacePlaybackRangeContextValue | null>(null);
export const WorkspacePreviewContext = createContext<VideoEditorWorkspaceState['preview'] | null>(
  null
);
export const WorkspaceSceneBackgroundContext = createContext<
  VideoEditorWorkspaceState['sceneBackgroundColors'] | null
>(null);
export const VideoEditorLibrariesContext = createContext<VideoEditorLibrariesState | null>(null);
export const VideoEditorSelectionsContext = createContext<VideoEditorSelections | null>(null);
export const VideoEditorBlockingOverlayContext = createContext<boolean | null>(null);

export const RuntimePlaybackContext = createContext<Pick<
  VideoEditorRuntimeController,
  'pausePlayback' | 'seekTo' | 'setPlaybackPlaying' | 'togglePlayback'
> | null>(null);
export const RuntimePreviewContext = createContext<Pick<
  VideoEditorRuntimeController,
  | 'assetUrls'
  | 'registerPreviewRuntime'
  | 'setTimelinePreviewSuspended'
  | 'setTimelinePreviewViewport'
  | 'timelinePreviews'
> | null>(null);
export const RuntimeProjectContext = createContext<Pick<
  VideoEditorRuntimeController,
  'applyLoadedProject'
> | null>(null);

export const AssetCommandContext = createContext<VideoEditorCommandHandlers['assets'] | null>(null);
export const ExportCommandContext = createContext<VideoEditorCommandHandlers['export'] | null>(
  null
);
export const ProjectCommandContext = createContext<VideoEditorCommandHandlers['project'] | null>(
  null
);
