import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorExportActions } from '../../../contracts/commands/export';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorExportRuntimeState } from '../../../contracts/export-state';
import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorShellController } from './workspace';
import type { VideoEditorWorkspaceController } from './workspace';

export interface VideoEditorOverlaysController {
  confirmDialog: VideoEditorWorkspaceState['confirm']['dialog'];
  exportDialog: {
    isOpen: boolean;
    onChange: VideoEditorExportActions['updateExportSettings'];
    onClose: VideoEditorExportActions['closeExportDialog'];
    onExport: VideoEditorActionHandlers['handleStartExport'];
    selectedClipId?: string | null;
    settings: VideoEditorExportRuntimeState['settings'];
  };
  exportProgress: {
    isRunning: boolean;
    onCancel: VideoEditorActionHandlers['handleCancelExport'];
    status: VideoEditorExportRuntimeState['status'];
  };
  exportFailure: {
    error: string | null;
    onClose: VideoEditorExportActions['closeExportDialog'];
    onRetry: VideoEditorActionHandlers['handleStartExport'];
  };
  onConfirmDialogCancel: VideoEditorWorkspaceState['confirm']['onCancel'];
  onConfirmDialogConfirm: VideoEditorWorkspaceState['confirm']['onConfirm'];
}

export interface VideoEditorCommandPaletteController {
  diagnosticsOpen: boolean;
  isPlaying: boolean;
  leftSidebarCollapsed: boolean;
  onAddShapeOverlay: VideoEditorProjectActions['addShapeOverlay'];
  onAddTextOverlay: () => void;
  onDeleteSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onOpenExportDialog: VideoEditorExportActions['openExportDialog'];
  onSplitSelectedClip: () => void;
  selectedClipId: string | null;
  toggleDiagnostics: () => void;
  togglePlaying: VideoEditorRuntimeController['togglePlayback'];
  toggleSidebarCollapsed: VideoEditorWorkspaceState['toggleSidebarCollapsed'];
}

interface VideoEditorSurfaceController {
  palette: VideoEditorCommandPaletteController;
  shell: VideoEditorShellController;
}

interface VideoEditorWorkspaceSurfaceController {
  overlays: VideoEditorOverlaysController;
  workspace: VideoEditorWorkspaceController | null;
}

export interface VideoEditorController
  extends VideoEditorSurfaceController, VideoEditorWorkspaceSurfaceController {}

export interface ReadyVideoEditorController
  extends VideoEditorSurfaceController, VideoEditorWorkspaceSurfaceController {
  workspace: VideoEditorWorkspaceController;
}
