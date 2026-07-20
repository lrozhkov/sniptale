import { useEffect, useMemo } from 'react';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { getSaveStateMeta } from '../app-model/utils';
import type { VideoEditorLibrariesState } from '../app-model/types';
import { useVideoEditorActionHandlers } from '../commands';
import { useVideoEditorLibraries } from './libraries';
import { useVideoEditorOverlayPlayback } from './overlay-playback';
import { usePlaybackRangeSanity } from './playback-range';
import { useVideoEditorRuntime, type VideoEditorRuntimeController } from '../session';
import { useCursorDetectionAnalysis } from '../cursor-detection/analysis';
import { useVideoEditorWorkspaceState } from './workspace-state';
import { useVideoEditorSelections } from './selections';
import { createVideoEditorController } from './builders';
import {
  getCurrentVideoEditorExportJobId,
  getCurrentVideoEditorProjectId,
  useVideoEditorControllerStorePort,
} from './store';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';
import type { VideoEditorController } from './contracts/surface';

function buildRuntimeParams(
  store: VideoEditorControllerStorePort,
  libraries: VideoEditorLibrariesState,
  workspace: ReturnType<typeof useVideoEditorWorkspaceState>,
  selections: ReturnType<typeof useControllerSelections>
) {
  return {
    project: store.project,
    recordingId: store.recordingId,
    pixelsPerSecond: store.pixelsPerSecond,
    playback: {
      isPlaying: store.isPlaying,
      currentTime: store.currentTime,
      playbackRange: workspace.playbackRange,
      placementMode: store.placementMode,
      selection: store.selection,
      selectedActionEvent: selections.selectedActionEvent,
      selectedClipId: store.selectedClipId,
      selectedMotionRegion: selections.selectedMotionRegion,
      deleteSelection: {
        actionEvent: store.deleteActionEvent,
        clip: store.deleteClip,
        cursorSample: store.deleteCursorSample,
        motionRegion: store.deleteMotionRegion,
        objectTrack: store.deleteObjectTrack,
      },
      clearPlacementMode: store.clearPlacementMode,
      setCurrentTime: store.setCurrentTime,
      setPlaying: store.setPlaying,
      splitClipAt: store.splitClipAt,
      updateActionEventDetails: store.updateActionEventDetails,
      updateClipTransform: store.updateClipTransform,
      updateMotionRegion: store.updateMotionRegion,
    },
    projectState: buildRuntimeProjectStateParams(store),
    exportState: {
      getActiveJobId: getCurrentVideoEditorExportJobId,
      updateExportStatus: store.updateExportStatus,
      failExport: store.failExport,
      completeExport: store.completeExport,
      cancelExport: store.cancelExport,
    },
    libraries,
  };
}

function buildRuntimeProjectStateParams(store: VideoEditorControllerStorePort) {
  return {
    setProject: store.setProject,
    updateProject: store.updateProject,
    setReady: store.setReady,
    setError: store.setError,
    setSaveState: store.setSaveState,
    setDiagnosticsOpen: store.setDiagnosticsOpen,
  };
}

function buildActionHandlerParams(
  store: VideoEditorControllerStorePort,
  libraries: VideoEditorLibrariesState,
  runtime: VideoEditorRuntimeController
) {
  return {
    project: store.project,
    getCurrentProjectId: getCurrentVideoEditorProjectId,
    currentTime: store.currentTime,
    selectedClipId: store.selectedClipId,
    projects: libraries.projects,
    exportState: store.exportState,
    libraries,
    applyLoadedProject: runtime.applyLoadedProject,
    setError: store.setError,
    upsertAsset: store.upsertAsset,
    addAssetClip: store.addAssetClip,
    moveClip: store.moveClip,
    trimClipEnd: store.trimClipEnd,
    trimClipStart: store.trimClipStart,
    startExport: store.startExport,
    failExport: store.failExport,
    failExportCancellation: store.failExportCancellation,
    cancelExport: store.cancelExport,
  };
}

function useBlockingOverlayOpen(
  workspace: ReturnType<typeof useVideoEditorWorkspaceState>,
  store: VideoEditorControllerStorePort
): boolean {
  return (
    workspace.audioRecordingDialogOpen ||
    workspace.libraryPanelOpen ||
    store.exportState.dialogOpen ||
    store.exportState.isRunning
  );
}

function useControllerSelections(store: VideoEditorControllerStorePort) {
  return useVideoEditorSelections(
    store.project,
    store.selection,
    store.selectedClipId,
    store.selectedTrackId
  );
}

function useRecordingTelemetry(
  sourceRecordingId: string | null,
  setRecordingTelemetry: VideoEditorControllerStorePort['setRecordingTelemetry']
) {
  useEffect(() => {
    let disposed = false;
    if (!sourceRecordingId) {
      setRecordingTelemetry(null);
      return () => {
        disposed = true;
      };
    }

    void getRecordingTelemetry(sourceRecordingId)
      .then((recordingTelemetry) => {
        if (!disposed) {
          setRecordingTelemetry(recordingTelemetry ?? null);
        }
      })
      .catch(() => {
        if (!disposed) {
          setRecordingTelemetry(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, [setRecordingTelemetry, sourceRecordingId]);
}

function useControllerCursorDetection(
  store: VideoEditorControllerStorePort,
  runtime: VideoEditorRuntimeController
) {
  return useCursorDetectionAnalysis({
    assetUrls: runtime.assetUrls,
    currentTime: store.currentTime,
    onSelectObjectTrack: store.selectObjectTrack,
    onUpsertObjectTrack: store.upsertObjectTrack,
    project: store.project,
    selectedClipId: store.selectedClipId,
  });
}

/**
 * Composes store state, runtime effects, and shell handlers for the entrypoint component.
 */
export function useVideoEditorController(): VideoEditorController {
  const store = useVideoEditorControllerStorePort();
  const { setRecordingTelemetry } = store;
  const libraries = useVideoEditorLibraries();
  const workspace = useVideoEditorWorkspaceState();
  const blockingOverlayOpen = useBlockingOverlayOpen(workspace, store);

  usePlaybackRangeSanity({
    project: store.project,
    playbackRange: workspace.playbackRange,
    clearPlaybackRange: workspace.clearPlaybackRange,
    setPlaybackRange: workspace.setPlaybackRange,
  });

  const selections = useControllerSelections(store);
  const runtime = useVideoEditorRuntime(
    buildRuntimeParams(store, libraries, workspace, selections)
  );
  const cursorDetection = useControllerCursorDetection(store, runtime);

  useVideoEditorOverlayPlayback({
    blockingOverlayOpen,
    enabled: store.project !== null,
    isPlaying: store.isPlaying,
    setPlaybackPlaying: runtime.setPlaybackPlaying,
  });

  const actions = useVideoEditorActionHandlers(
    buildActionHandlerParams(store, libraries, runtime),
    {
      requestConfirm: workspace.confirm.request,
    }
  );
  const saveStateMeta = useMemo(() => getSaveStateMeta(store.saveState), [store.saveState]);
  const sourceRecordingId = store.project?.baseRecordingId ?? null;

  useRecordingTelemetry(sourceRecordingId, setRecordingTelemetry);

  return createVideoEditorController({
    actions,
    cursorDetection,
    diagnosticsContent: null,
    libraries,
    runtime,
    saveStateMeta,
    selections,
    store,
    workspace,
  });
}
