import { useShallow } from 'zustand/react/shallow';
import type {
  AnnotationEditingPort,
  ClipSelectionPort,
  DiagnosticsTelemetryPort,
  EffectEditingPort,
  ExportPort,
  HistoryPort,
  PlaybackPort,
  ProjectLifecyclePort,
  RuntimeSessionPort,
  TimelineEditingPort,
  VideoEditorProjectStorageStatus,
} from '../../contracts/controller-store';
import { useVideoEditorStore, type VideoEditorState } from '../../state/store';

type PortSelector<Port, Selection> = (port: Port) => Selection;

const projectHistoryStatusByState = new WeakMap<
  VideoEditorState['projectHistory'],
  HistoryPort['projectHistoryStatus']
>();

function selectProjectHistoryStatus(
  projectHistory: VideoEditorState['projectHistory']
): HistoryPort['projectHistoryStatus'] {
  const cached = projectHistoryStatusByState.get(projectHistory);
  if (cached) return cached;
  const status = {
    canUndo: projectHistory.transaction === null && projectHistory.past.length > 0,
    canRedo: projectHistory.transaction === null && projectHistory.future.length > 0,
    error: projectHistory.error,
  };
  projectHistoryStatusByState.set(projectHistory, status);
  return status;
}

function usePort<Port, Selection>(
  selectPort: (state: VideoEditorState) => Port,
  selector: PortSelector<Port, Selection>
): Selection {
  return useVideoEditorStore(useShallow((state) => selector(selectPort(state))));
}

function selectPlaybackPort(state: VideoEditorState): PlaybackPort {
  return {
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    setCurrentTime: state.setCurrentTime,
    setPlaying: state.setPlaying,
    togglePlaying: state.togglePlaying,
  };
}

function selectTimelineEditingPort(state: VideoEditorState): TimelineEditingPort {
  return {
    addAssetClip: state.addAssetClip,
    addTrack: state.addTrack,
    addTrackLogicalLane: state.addTrackLogicalLane,
    addVideoBlock: state.addVideoBlock,
    applyMediaClipVisualsToTrack: state.applyMediaClipVisualsToTrack,
    clearCursorSampleSkinOverride: state.clearCursorSampleSkinOverride,
    clearUtilityLane: state.clearUtilityLane,
    closeTrackGap: state.closeTrackGap,
    deleteActionEvent: state.deleteActionEvent,
    deleteClip: state.deleteClip,
    deleteCursorSample: state.deleteCursorSample,
    deleteMotionRegion: state.deleteMotionRegion,
    deleteObjectTrack: state.deleteObjectTrack,
    deleteTrack: state.deleteTrack,
    detachClipGroup: state.detachClipGroup,
    duplicateClip: state.duplicateClip,
    insertCursorSample: state.insertCursorSample,
    moveClip: state.moveClip,
    moveTrack: state.moveTrack,
    pixelsPerSecond: state.pixelsPerSecond,
    renameTrack: state.renameTrack,
    setPixelsPerSecond: state.setPixelsPerSecond,
    splitClipAt: state.splitClipAt,
    toggleTrackLock: state.toggleTrackLock,
    toggleTrackVisibility: state.toggleTrackVisibility,
    toggleUtilityLaneLock: state.toggleUtilityLaneLock,
    toggleUtilityLaneVisibility: state.toggleUtilityLaneVisibility,
    trimClipEnd: state.trimClipEnd,
    trimClipStart: state.trimClipStart,
    updateActionEventDetails: state.updateActionEventDetails,
    updateClipAudioEnvelope: state.updateClipAudioEnvelope,
    updateClipFades: state.updateClipFades,
    updateClipMuted: state.updateClipMuted,
    updateClipPlaybackRate: state.updateClipPlaybackRate,
    updateClipTransform: state.updateClipTransform,
    updateClipTransitions: state.updateClipTransitions,
    updateClipVolume: state.updateClipVolume,
    updateCursorSampleInterpolation: state.updateCursorSampleInterpolation,
    updateCursorSampleSkinOverride: state.updateCursorSampleSkinOverride,
    updateCursorSampleVisibility: state.updateCursorSampleVisibility,
    updateMediaClipFitMode: state.updateMediaClipFitMode,
    updateMediaClipFitScalePercent: state.updateMediaClipFitScalePercent,
    updateMediaClipShadowIntensity: state.updateMediaClipShadowIntensity,
    updateMediaClipShadowMode: state.updateMediaClipShadowMode,
    updateMotionRegion: state.updateMotionRegion,
    updateProject: state.updateProject,
    updateTransitionDuration: state.updateTransitionDuration,
    updateTransitionEasing: state.updateTransitionEasing,
    updateTransitionTemplate: state.updateTransitionTemplate,
    upsertAsset: state.upsertAsset,
    upsertObjectTrack: state.upsertObjectTrack,
    upsertObjectTrackCorrectionAnchor: state.upsertObjectTrackCorrectionAnchor,
  };
}

function selectClipSelectionPort(state: VideoEditorState): ClipSelectionPort {
  return {
    selectedClipId: state.selectedClipId,
    selectedTrackId: state.selectedTrackId,
    selection: state.selection,
    selectActionSegment: state.selectActionSegment,
    selectClip: state.selectClip,
    selectCursorSegment: state.selectCursorSegment,
    selectMotionRegion: state.selectMotionRegion,
    selectObjectTrack: state.selectObjectTrack,
    selectScene: state.selectScene,
    selectTrack: state.selectTrack,
    selectTransition: state.selectTransition,
  };
}

function selectEffectEditingPort(state: VideoEditorState): EffectEditingPort {
  return {
    applyEffectDocument: state.applyEffectDocument,
    deleteEffectInstance: state.deleteEffectInstance,
    duplicateEffectInstance: state.duplicateEffectInstance,
    moveEffectInstance: state.moveEffectInstance,
    updateEffectInstance: state.updateEffectInstance,
  };
}

function selectAnnotationEditingPort(state: VideoEditorState): AnnotationEditingPort {
  return {
    addAnnotationOverlay: state.addAnnotationOverlay,
    addShapeOverlay: state.addShapeOverlay,
    addSubtitleOverlay: state.addSubtitleOverlay,
    addTextOverlay: state.addTextOverlay,
    convertTextClipToAnnotation: state.convertTextClipToAnnotation,
    updateAnnotationClipContent: state.updateAnnotationClipContent,
    updateAnnotationClipStyle: state.updateAnnotationClipStyle,
    updateAnnotationClipTemplate: state.updateAnnotationClipTemplate,
    updateShapeClipStyle: state.updateShapeClipStyle,
    updateSubtitleTrackStyle: state.updateSubtitleTrackStyle,
    updateTextClipContent: state.updateTextClipContent,
    updateTextClipStyle: state.updateTextClipStyle,
  };
}

function selectHistoryPort(state: VideoEditorState): HistoryPort {
  return {
    beginProjectHistoryTransaction: state.beginProjectHistoryTransaction,
    endProjectHistoryTransaction: state.endProjectHistoryTransaction,
    isProjectHistoryTransactionCurrent: state.isProjectHistoryTransactionCurrent,
    projectHistoryTransactionActive: state.projectHistory.transaction !== null,
    projectHistoryStatus: selectProjectHistoryStatus(state.projectHistory),
    redoProject: state.redoProject,
    undoProject: state.undoProject,
  };
}

function selectExportPort(state: VideoEditorState): ExportPort {
  return {
    cancelExport: state.cancelExport,
    closeExportDialog: state.closeExportDialog,
    completeExport: state.completeExport,
    exportState: state.exportState,
    failExport: state.failExport,
    failExportCancellation: state.failExportCancellation,
    openExportDialog: state.openExportDialog,
    startExport: state.startExport,
    updateExportSettings: state.updateExportSettings,
    updateExportStatus: state.updateExportStatus,
  };
}

function selectProjectLifecyclePort(state: VideoEditorState): ProjectLifecyclePort {
  return {
    error: state.error,
    isReady: state.isReady,
    project: state.project,
    recordingId: state.recordingId,
    renameProject: state.renameProject,
    saveState: state.saveState,
    setError: state.setError,
    setProject: state.setProject,
    setReady: state.setReady,
    setSaveState: state.setSaveState,
    syncProjectRevision: state.syncProjectRevision,
  };
}

function selectRuntimeSessionPort(state: VideoEditorState): RuntimeSessionPort {
  return {
    clearPlacementMode: state.clearPlacementMode,
    placementMode: state.placementMode,
    startActionPointPlacement: state.startActionPointPlacement,
    startMotionAreaPlacement: state.startMotionAreaPlacement,
    startMotionFocusPlacement: state.startMotionFocusPlacement,
    startMotionPathStopAreaPlacement: state.startMotionPathStopAreaPlacement,
    startMotionPathStopPointPlacement: state.startMotionPathStopPointPlacement,
    startObjectTrackAnchorPlacement: state.startObjectTrackAnchorPlacement,
  };
}

function selectDiagnosticsTelemetryPort(state: VideoEditorState): DiagnosticsTelemetryPort {
  return {
    diagnosticsOpen: state.diagnosticsOpen,
    recordingTelemetry: state.recordingTelemetry,
    setDiagnosticsOpen: state.setDiagnosticsOpen,
    setRecordingTelemetry: state.setRecordingTelemetry,
    telemetryLaneVisible: state.telemetryLaneVisible,
    toggleTelemetryLaneVisibility: state.toggleTelemetryLaneVisibility,
  };
}

export function useVideoEditorPlaybackPort<Selection>(
  selector: PortSelector<PlaybackPort, Selection>
): Selection {
  return usePort(selectPlaybackPort, selector);
}

export function useVideoEditorTimelineEditingPort<Selection>(
  selector: PortSelector<TimelineEditingPort, Selection>
): Selection {
  return usePort(selectTimelineEditingPort, selector);
}

export function useVideoEditorClipSelectionPort<Selection>(
  selector: PortSelector<ClipSelectionPort, Selection>
): Selection {
  return usePort(selectClipSelectionPort, selector);
}

export function useVideoEditorEffectEditingPort<Selection>(
  selector: PortSelector<EffectEditingPort, Selection>
): Selection {
  return usePort(selectEffectEditingPort, selector);
}

export function useVideoEditorAnnotationEditingPort<Selection>(
  selector: PortSelector<AnnotationEditingPort, Selection>
): Selection {
  return usePort(selectAnnotationEditingPort, selector);
}

export function useVideoEditorHistoryPort<Selection>(
  selector: PortSelector<HistoryPort, Selection>
): Selection {
  return usePort(selectHistoryPort, selector);
}

export function useVideoEditorExportPort<Selection>(
  selector: PortSelector<ExportPort, Selection>
): Selection {
  return usePort(selectExportPort, selector);
}

export function useVideoEditorProjectLifecyclePort<Selection>(
  selector: PortSelector<ProjectLifecyclePort, Selection>
): Selection {
  return usePort(selectProjectLifecyclePort, selector);
}

export function useVideoEditorRuntimeSessionPort<Selection>(
  selector: PortSelector<RuntimeSessionPort, Selection>
): Selection {
  return usePort(selectRuntimeSessionPort, selector);
}

export function useVideoEditorDiagnosticsTelemetryPort<Selection>(
  selector: PortSelector<DiagnosticsTelemetryPort, Selection>
): Selection {
  return usePort(selectDiagnosticsTelemetryPort, selector);
}

export function useVideoEditorProjectStorageStatus(): VideoEditorProjectStorageStatus {
  return useVideoEditorStore(
    useShallow((state) => ({
      projectUpdatedAt: state.project?.updatedAt ?? null,
      saveState: state.saveState,
    }))
  );
}

export function getCurrentVideoEditorProjectSnapshot() {
  return useVideoEditorStore.getState().project;
}

export function getCurrentVideoEditorProjectId(): string | null {
  return useVideoEditorStore.getState().project?.id ?? null;
}

export function getCurrentVideoEditorCurrentTime(): number {
  return useVideoEditorStore.getState().currentTime;
}

export function getCurrentVideoEditorSelectedClipId(): string | null {
  return useVideoEditorStore.getState().selectedClipId;
}

export function getCurrentVideoEditorExportStateSnapshot() {
  return useVideoEditorStore.getState().exportState;
}

export function getCurrentVideoEditorExportJobId(): string | null {
  return useVideoEditorStore.getState().exportState.jobId;
}
