import type { VideoEditorRuntimeController } from '../session';
import type { VideoEditorActionHandlers } from '../commands';
import type { VideoEditorWorkspaceState } from './workspace-state';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';
import type {
  VideoEditorCommandPaletteController,
  VideoEditorOverlaysController,
} from './contracts/surface';
import type { VideoEditorShellController } from './contracts/workspace';
import { createSelectedClipActions } from './selected-clip-actions';

export function createVideoEditorShellController(
  store: VideoEditorControllerStorePort
): VideoEditorShellController {
  return {
    error: store.error,
    isReady: store.isReady,
    project: store.project,
  };
}

export function createVideoEditorOverlaysController(args: {
  actions: Pick<VideoEditorActionHandlers, 'handleCancelExport' | 'handleStartExport'>;
  store: VideoEditorControllerStorePort;
  workspace: Pick<VideoEditorWorkspaceState, 'confirm'>;
}): VideoEditorOverlaysController {
  return {
    confirmDialog: args.workspace.confirm.dialog,
    onConfirmDialogCancel: args.workspace.confirm.onCancel,
    onConfirmDialogConfirm: args.workspace.confirm.onConfirm,
    exportDialog: {
      isOpen: args.store.exportState.dialogOpen,
      onChange: args.store.updateExportSettings,
      onClose: args.store.closeExportDialog,
      onExport: args.actions.handleStartExport,
      selectedClipId: args.store.selectedClipId,
      settings: args.store.exportState.settings,
    },
    exportProgress: {
      isRunning: args.store.exportState.isRunning,
      onCancel: args.actions.handleCancelExport,
      status: args.store.exportState.status,
    },
    exportFailure: {
      error: args.store.exportState.error,
      onClose: args.store.closeExportDialog,
      onRetry: args.actions.handleStartExport,
    },
  };
}

export function createVideoEditorCommandPaletteController(args: {
  runtime: Pick<VideoEditorRuntimeController, 'togglePlayback'>;
  store: VideoEditorControllerStorePort;
  workspace: Pick<VideoEditorWorkspaceState, 'leftSidebarCollapsed' | 'toggleSidebarCollapsed'>;
}): VideoEditorCommandPaletteController {
  const selectedClipActions = createSelectedClipActions(args.store);

  return {
    diagnosticsOpen: args.store.diagnosticsOpen,
    isPlaying: args.store.isPlaying,
    leftSidebarCollapsed: args.workspace.leftSidebarCollapsed,
    onAddShapeOverlay: args.store.addShapeOverlay,
    onAddTextOverlay: () => args.store.addTextOverlay(),
    onDeleteSelectedClip: selectedClipActions.deleteSelectedClip,
    onDuplicateSelectedClip: selectedClipActions.duplicateSelectedClip,
    onOpenExportDialog: args.store.openExportDialog,
    onSplitSelectedClip: selectedClipActions.splitSelectedClip,
    selectedClipId: args.store.selectedClipId,
    toggleDiagnostics: () => args.store.setDiagnosticsOpen(!args.store.diagnosticsOpen),
    togglePlaying: args.runtime.togglePlayback,
    toggleSidebarCollapsed: args.workspace.toggleSidebarCollapsed,
  };
}
