import { useMemo, type PropsWithChildren } from 'react';
import { useVideoEditorActionHandlers } from '../../commands';
import { useVideoEditorRuntime } from '../../session';
import { useVideoEditorProjectHistoryShortcuts } from '../../session/history-shortcuts';
import { useVideoEditorLibraries } from '../libraries';
import { useVideoEditorOverlayPlayback } from '../overlay-playback';
import { usePlaybackRangeSanity } from '../playback-range';
import { useRecordingTelemetry } from '../recording-telemetry';
import { useVideoEditorSelections } from '../selections';
import {
  getCurrentVideoEditorCurrentTime,
  getCurrentVideoEditorExportJobId,
  getCurrentVideoEditorExportStateSnapshot,
  getCurrentVideoEditorProjectId,
  getCurrentVideoEditorProjectSnapshot,
  getCurrentVideoEditorSelectedClipId,
  useVideoEditorClipSelectionPort,
  useVideoEditorDiagnosticsTelemetryPort,
  useVideoEditorExportPort,
  useVideoEditorHistoryPort,
  useVideoEditorPlaybackPort,
  useVideoEditorProjectLifecyclePort,
  useVideoEditorRuntimeSessionPort,
  useVideoEditorTimelineEditingPort,
} from '../store';
import { useVideoEditorWorkspaceState } from '../workspace-state';
import {
  AssetCommandContext,
  ExportCommandContext,
  ProjectCommandContext,
  RuntimePlaybackContext,
  RuntimePreviewContext,
  RuntimeProjectContext,
  VideoEditorBlockingOverlayContext,
  VideoEditorLibrariesContext,
  VideoEditorSelectionsContext,
  WorkspaceGridContext,
  WorkspaceInspectorContext,
  WorkspacePlaybackRangeContext,
  WorkspacePreviewContext,
  WorkspaceSceneBackgroundContext,
  WorkspaceDialogsContext,
  WorkspaceLayoutContext,
} from './contexts';

function useVideoEditorRuntimeComposition(
  libraries: ReturnType<typeof useVideoEditorLibraries>,
  workspace: ReturnType<typeof useVideoEditorWorkspaceState>
) {
  const lifecycle = useVideoEditorProjectLifecyclePort((port) => port);
  const playback = useVideoEditorPlaybackPort((port) => port);
  const selection = useVideoEditorClipSelectionPort((port) => port);
  const timeline = useVideoEditorTimelineEditingPort((port) => port);
  const history = useVideoEditorHistoryPort((port) => port);
  const exportPort = useVideoEditorExportPort((port) => port);
  const session = useVideoEditorRuntimeSessionPort((port) => port);
  const telemetry = useVideoEditorDiagnosticsTelemetryPort((port) => port);
  const selections = useVideoEditorSelections(
    lifecycle.project,
    selection.selection,
    selection.selectedClipId,
    selection.selectedTrackId
  );
  const blockingOverlayOpen =
    workspace.confirm.dialog !== null ||
    workspace.audioRecordingDialogOpen ||
    workspace.libraryPanelOpen ||
    exportPort.exportState.dialogOpen ||
    exportPort.exportState.error !== null ||
    exportPort.exportState.isRunning;

  useVideoEditorProjectHistoryShortcuts({
    enabled: lifecycle.project !== null && !blockingOverlayOpen,
    status: history.projectHistoryStatus,
    undo: history.undoProject,
    redo: history.redoProject,
  });
  usePlaybackRangeSanity({
    project: lifecycle.project,
    playbackRange: workspace.playbackRange,
    clearPlaybackRange: workspace.clearPlaybackRange,
    setPlaybackRange: workspace.setPlaybackRange,
  });

  const runtime = useVideoEditorRuntime({
    project: lifecycle.project,
    recordingId: lifecycle.recordingId,
    pixelsPerSecond: timeline.pixelsPerSecond,
    playback: {
      isPlaying: playback.isPlaying,
      currentTime: playback.currentTime,
      playbackRange: workspace.playbackRange,
      placementMode: session.placementMode,
      projectHistoryTransactionActive: history.projectHistoryTransactionActive,
      selection: selection.selection,
      selectedActionEvent: selections.selectedActionEvent,
      selectedClipId: selection.selectedClipId,
      selectedMotionRegion: selections.selectedMotionRegion,
      deleteSelection: {
        actionEvent: timeline.deleteActionEvent,
        clip: timeline.deleteClip,
        cursorSample: timeline.deleteCursorSample,
        motionRegion: timeline.deleteMotionRegion,
        objectTrack: timeline.deleteObjectTrack,
      },
      clearPlacementMode: session.clearPlacementMode,
      setCurrentTime: playback.setCurrentTime,
      setPlaying: playback.setPlaying,
      splitClipAt: timeline.splitClipAt,
      updateActionEventDetails: timeline.updateActionEventDetails,
      updateClipTransform: timeline.updateClipTransform,
      updateMotionRegion: timeline.updateMotionRegion,
    },
    projectState: {
      setProject: lifecycle.setProject,
      updateProject: timeline.updateProject,
      syncProjectRevision: lifecycle.syncProjectRevision,
      setReady: lifecycle.setReady,
      setError: lifecycle.setError,
      setSaveState: lifecycle.setSaveState,
      setDiagnosticsOpen: telemetry.setDiagnosticsOpen,
    },
    exportState: {
      getActiveJobId: getCurrentVideoEditorExportJobId,
      updateExportStatus: exportPort.updateExportStatus,
      failExport: exportPort.failExport,
      completeExport: exportPort.completeExport,
      cancelExport: exportPort.cancelExport,
    },
    libraries,
  });

  useVideoEditorOverlayPlayback({
    blockingOverlayOpen,
    enabled: lifecycle.project !== null,
    isPlaying: playback.isPlaying,
    setPlaybackPlaying: runtime.setPlaybackPlaying,
  });
  useRecordingTelemetry(
    lifecycle.project?.baseRecordingId ?? null,
    telemetry.setRecordingTelemetry
  );

  return { blockingOverlayOpen, exportPort, lifecycle, runtime, selections, timeline };
}

function useVideoEditorCommandComposition(
  composition: ReturnType<typeof useVideoEditorRuntimeComposition>,
  libraries: ReturnType<typeof useVideoEditorLibraries>,
  workspace: ReturnType<typeof useVideoEditorWorkspaceState>
) {
  const { exportPort, lifecycle, runtime, timeline } = composition;
  const assetCommandPort = useMemo(
    () => ({
      getCurrentProject: getCurrentVideoEditorProjectSnapshot,
      getCurrentProjectId: getCurrentVideoEditorProjectId,
      getCurrentTime: getCurrentVideoEditorCurrentTime,
      setError: lifecycle.setError,
      upsertAsset: timeline.upsertAsset,
      addAssetClip: timeline.addAssetClip,
      moveClip: timeline.moveClip,
      trimClipEnd: timeline.trimClipEnd,
      trimClipStart: timeline.trimClipStart,
    }),
    [
      lifecycle.setError,
      timeline.addAssetClip,
      timeline.moveClip,
      timeline.trimClipEnd,
      timeline.trimClipStart,
      timeline.upsertAsset,
    ]
  );
  const exportCommandPort = useMemo(
    () => ({
      getCurrentProject: getCurrentVideoEditorProjectSnapshot,
      getCurrentSelectedClipId: getCurrentVideoEditorSelectedClipId,
      getCurrentExportState: getCurrentVideoEditorExportStateSnapshot,
      startExport: exportPort.startExport,
      failExport: exportPort.failExport,
      failExportCancellation: exportPort.failExportCancellation,
      cancelExport: exportPort.cancelExport,
    }),
    [
      exportPort.cancelExport,
      exportPort.failExport,
      exportPort.failExportCancellation,
      exportPort.startExport,
    ]
  );
  const projectCommandLibraries = useMemo(
    () => ({
      refreshProjectExports: libraries.refreshProjectExports,
      refreshProjects: libraries.refreshProjects,
    }),
    [libraries.refreshProjectExports, libraries.refreshProjects]
  );
  const projectCommandPort = useMemo(
    () => ({
      getCurrentProject: getCurrentVideoEditorProjectSnapshot,
      projects: libraries.projects,
      libraries: projectCommandLibraries,
      applyLoadedProject: runtime.applyLoadedProject,
      setError: lifecycle.setError,
    }),
    [libraries.projects, lifecycle.setError, projectCommandLibraries, runtime.applyLoadedProject]
  );
  const commandPorts = useMemo(
    () => ({ assets: assetCommandPort, export: exportCommandPort, project: projectCommandPort }),
    [assetCommandPort, exportCommandPort, projectCommandPort]
  );
  const confirmHandlers = useMemo(
    () => ({ requestConfirm: workspace.confirm.request }),
    [workspace.confirm.request]
  );
  return useVideoEditorActionHandlers(commandPorts, confirmHandlers);
}

function useVideoEditorContextProjections(
  runtime: ReturnType<typeof useVideoEditorRuntime>,
  workspace: ReturnType<typeof useVideoEditorWorkspaceState>
) {
  const workspaceDialogs = useMemo(
    () => ({
      audioRecordingDialogOpen: workspace.audioRecordingDialogOpen,
      closeAudioRecordingDialog: workspace.closeAudioRecordingDialog,
      closeLibraryPanel: workspace.closeLibraryPanel,
      confirm: workspace.confirm,
      libraryPanelOpen: workspace.libraryPanelOpen,
      openAudioRecordingDialog: workspace.openAudioRecordingDialog,
      openLibraryPanel: workspace.openLibraryPanel,
      toggleLibraryPanel: workspace.toggleLibraryPanel,
    }),
    [
      workspace.audioRecordingDialogOpen,
      workspace.closeAudioRecordingDialog,
      workspace.closeLibraryPanel,
      workspace.confirm,
      workspace.libraryPanelOpen,
      workspace.openAudioRecordingDialog,
      workspace.openLibraryPanel,
      workspace.toggleLibraryPanel,
    ]
  );
  const workspaceLayout = useMemo(
    () => ({
      leftSidebarCollapsed: workspace.leftSidebarCollapsed,
      toggleSidebarCollapsed: workspace.toggleSidebarCollapsed,
    }),
    [workspace.leftSidebarCollapsed, workspace.toggleSidebarCollapsed]
  );
  const workspacePlaybackRange = useMemo(
    () => ({
      clearPlaybackRange: workspace.clearPlaybackRange,
      playbackRange: workspace.playbackRange,
      setPlaybackRange: workspace.setPlaybackRange,
    }),
    [workspace.clearPlaybackRange, workspace.playbackRange, workspace.setPlaybackRange]
  );
  const runtimePlayback = useMemo(
    () => ({
      pausePlayback: runtime.pausePlayback,
      seekTo: runtime.seekTo,
      setPlaybackPlaying: runtime.setPlaybackPlaying,
      togglePlayback: runtime.togglePlayback,
    }),
    [runtime.pausePlayback, runtime.seekTo, runtime.setPlaybackPlaying, runtime.togglePlayback]
  );
  const runtimePreview = useMemo(
    () => ({
      assetUrls: runtime.assetUrls,
      registerPreviewRuntime: runtime.registerPreviewRuntime,
      setTimelinePreviewSuspended: runtime.setTimelinePreviewSuspended,
      setTimelinePreviewViewport: runtime.setTimelinePreviewViewport,
      timelinePreviews: runtime.timelinePreviews,
    }),
    [
      runtime.assetUrls,
      runtime.registerPreviewRuntime,
      runtime.setTimelinePreviewSuspended,
      runtime.setTimelinePreviewViewport,
      runtime.timelinePreviews,
    ]
  );
  const runtimeProject = useMemo(
    () => ({ applyLoadedProject: runtime.applyLoadedProject }),
    [runtime.applyLoadedProject]
  );
  return {
    runtimePlayback,
    runtimePreview,
    runtimeProject,
    workspaceDialogs,
    workspaceLayout,
    workspacePlaybackRange,
  };
}

export function VideoEditorCompositionProvider({ children }: PropsWithChildren) {
  const libraries = useVideoEditorLibraries();
  const workspace = useVideoEditorWorkspaceState();
  const composition = useVideoEditorRuntimeComposition(libraries, workspace);
  const commands = useVideoEditorCommandComposition(composition, libraries, workspace);
  const contexts = useVideoEditorContextProjections(composition.runtime, workspace);

  return (
    <WorkspaceDialogsContext.Provider value={contexts.workspaceDialogs}>
      <WorkspaceLayoutContext.Provider value={contexts.workspaceLayout}>
        <WorkspaceGridContext.Provider value={workspace.grid}>
          <WorkspaceInspectorContext.Provider value={workspace.inspector}>
            <WorkspacePlaybackRangeContext.Provider value={contexts.workspacePlaybackRange}>
              <WorkspacePreviewContext.Provider value={workspace.preview}>
                <WorkspaceSceneBackgroundContext.Provider value={workspace.sceneBackgroundColors}>
                  <VideoEditorLibrariesContext.Provider value={libraries}>
                    <VideoEditorSelectionsContext.Provider value={composition.selections}>
                      <VideoEditorBlockingOverlayContext.Provider
                        value={composition.blockingOverlayOpen}
                      >
                        <RuntimePlaybackContext.Provider value={contexts.runtimePlayback}>
                          <RuntimePreviewContext.Provider value={contexts.runtimePreview}>
                            <RuntimeProjectContext.Provider value={contexts.runtimeProject}>
                              <AssetCommandContext.Provider value={commands.assets}>
                                <ExportCommandContext.Provider value={commands.export}>
                                  <ProjectCommandContext.Provider value={commands.project}>
                                    {children}
                                  </ProjectCommandContext.Provider>
                                </ExportCommandContext.Provider>
                              </AssetCommandContext.Provider>
                            </RuntimeProjectContext.Provider>
                          </RuntimePreviewContext.Provider>
                        </RuntimePlaybackContext.Provider>
                      </VideoEditorBlockingOverlayContext.Provider>
                    </VideoEditorSelectionsContext.Provider>
                  </VideoEditorLibrariesContext.Provider>
                </WorkspaceSceneBackgroundContext.Provider>
              </WorkspacePreviewContext.Provider>
            </WorkspacePlaybackRangeContext.Provider>
          </WorkspaceInspectorContext.Provider>
        </WorkspaceGridContext.Provider>
      </WorkspaceLayoutContext.Provider>
    </WorkspaceDialogsContext.Provider>
  );
}
