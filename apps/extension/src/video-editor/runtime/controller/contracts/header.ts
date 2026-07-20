import type { SaveStateMeta } from '../../app-model/types';
import type { VideoEditorExportActions } from '../../../contracts/commands/export';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoProjectSourceKind } from '../../../../features/video/project/types';
import type { VideoEditorWorkspaceState } from '../workspace-state';

export interface VideoEditorHeaderController {
  grid: {
    magnetEnabled: boolean;
    onToggleMagnet: VideoEditorWorkspaceState['grid']['toggleMagnet'];
  };
  libraryPanelOpen: boolean;
  inspectorMode: VideoEditorWorkspaceState['inspector']['mode'];
  leftSidebarCollapsed: boolean;
  onOpenAudioRecordingDialog: () => void;
  onCloseLibraryPanel: () => void;
  onOpenExportDialog: VideoEditorExportActions['openExportDialog'];
  onOpenGridSettings: () => void;
  onOpenLibraryPanel: () => void;
  onRenameProject: VideoEditorProjectActions['renameProject'];
  onSelectScene: VideoEditorSessionActions['selectScene'];
  onToggleLibraryPanel: () => void;
  onToggleSidebar: VideoEditorWorkspaceState['toggleSidebarCollapsed'];
  projectExportsCount: number;
  projectMeta?: {
    duration: number;
    fps: number;
    height: number;
    sourceKind: VideoProjectSourceKind;
    width: number;
  };
  projectName: string;
  saveStateMeta: SaveStateMeta;
}

export interface VideoEditorWorkspaceLayoutController {
  audioRecordingDialogOpen: boolean;
  closeAudioRecordingDialog: VideoEditorWorkspaceState['closeAudioRecordingDialog'];
  handleStartVerticalResize: VideoEditorWorkspaceState['preview']['handleStartVerticalResize'];
  leftSidebarCollapsed: boolean;
  openAudioRecordingDialog: VideoEditorWorkspaceState['openAudioRecordingDialog'];
  previewPaneHeight: number | null;
  toggleSidebarCollapsed: VideoEditorWorkspaceState['toggleSidebarCollapsed'];
  workspaceSplitRef: React.RefObject<HTMLDivElement | null>;
}
