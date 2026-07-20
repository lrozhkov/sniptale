import { useShallow } from 'zustand/react/shallow';
import { useVideoEditorStore, type VideoEditorState } from '../../state/store';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';

function selectVideoEditorRuntimeStoreSlice(state: VideoEditorState) {
  return {
    cancelExport: state.cancelExport,
    closeTrackGap: state.closeTrackGap,
    completeExport: state.completeExport,
    currentTime: state.currentTime,
    deleteClip: state.deleteClip,
    failExportCancellation: state.failExportCancellation,
    failExport: state.failExport,
    isPlaying: state.isPlaying,
    pixelsPerSecond: state.pixelsPerSecond,
    project: state.project,
    recordingTelemetry: state.recordingTelemetry,
    recordingId: state.recordingId,
    selectedClipId: state.selectedClipId,
    setCurrentTime: state.setCurrentTime,
    setDiagnosticsOpen: state.setDiagnosticsOpen,
    setError: state.setError,
    setPlaying: state.setPlaying,
    setProject: state.setProject,
    setRecordingTelemetry: state.setRecordingTelemetry,
    setReady: state.setReady,
    setSaveState: state.setSaveState,
    splitClipAt: state.splitClipAt,
    updateExportStatus: state.updateExportStatus,
  };
}

function selectVideoEditorWorkspaceSceneStoreSlice(state: VideoEditorState) {
  return {
    addShapeOverlay: state.addShapeOverlay,
    addSubtitleOverlay: state.addSubtitleOverlay,
    addVideoBlock: state.addVideoBlock,
    addAnnotationOverlay: state.addAnnotationOverlay,
    addTextOverlay: state.addTextOverlay,
    addTrackLogicalLane: state.addTrackLogicalLane,
    addTrack: state.addTrack,
    currentTime: state.currentTime,
    clearPlacementMode: state.clearPlacementMode,
    clearCursorSampleSkinOverride: state.clearCursorSampleSkinOverride,
    deleteActionEvent: state.deleteActionEvent,
    deleteClip: state.deleteClip,
    deleteCursorSample: state.deleteCursorSample,
    deleteObjectTrack: state.deleteObjectTrack,
    deleteTrack: state.deleteTrack,
    deleteMotionRegion: state.deleteMotionRegion,
    detachClipGroup: state.detachClipGroup,
    diagnosticsOpen: state.diagnosticsOpen,
    duplicateClip: state.duplicateClip,
    insertCursorSample: state.insertCursorSample,
    isPlaying: state.isPlaying,
    moveClip: state.moveClip,
    moveTrack: state.moveTrack,
    openExportDialog: state.openExportDialog,
    pixelsPerSecond: state.pixelsPerSecond,
    placementMode: state.placementMode,
    project: state.project,
    recordingId: state.recordingId,
    telemetryLaneVisible: state.telemetryLaneVisible,
    renameProject: state.renameProject,
    renameTrack: state.renameTrack,
    updateProject: state.updateProject,
  };
}

function selectVideoEditorWorkspaceSelectionStoreSlice(state: VideoEditorState) {
  return {
    ...selectVideoEditorWorkspaceSelectionCoreSlice(state),
    ...selectVideoEditorWorkspaceSelectionMutationSlice(state),
  };
}

function selectVideoEditorWorkspaceSelectionCoreSlice(state: VideoEditorState) {
  return {
    selection: state.selection,
    selectedClipId: state.selectedClipId,
    selectedTrackId: state.selectedTrackId,
    selectActionSegment: state.selectActionSegment,
    selectCursorSegment: state.selectCursorSegment,
    selectMotionRegion: state.selectMotionRegion,
    selectObjectTrack: state.selectObjectTrack,
    selectScene: state.selectScene,
    selectClip: state.selectClip,
    selectTrack: state.selectTrack,
    selectTransition: state.selectTransition,
    setDiagnosticsOpen: state.setDiagnosticsOpen,
    setPixelsPerSecond: state.setPixelsPerSecond,
    setPlaying: state.setPlaying,
    togglePlaying: state.togglePlaying,
    toggleTelemetryLaneVisibility: state.toggleTelemetryLaneVisibility,
    toggleTrackLock: state.toggleTrackLock,
    toggleTrackVisibility: state.toggleTrackVisibility,
    toggleUtilityLaneLock: state.toggleUtilityLaneLock,
    toggleUtilityLaneVisibility: state.toggleUtilityLaneVisibility,
    clearUtilityLane: state.clearUtilityLane,
    trimClipEnd: state.trimClipEnd,
    trimClipStart: state.trimClipStart,
  };
}

function selectVideoEditorWorkspaceSelectionMutationSlice(state: VideoEditorState) {
  return {
    updateClipFades: state.updateClipFades,
    updateClipPlaybackRate: state.updateClipPlaybackRate,
    updateClipMuted: state.updateClipMuted,
    updateClipTransform: state.updateClipTransform,
    updateClipTransitions: state.updateClipTransitions,
    updateClipVolume: state.updateClipVolume,
    updateClipAudioEnvelope: state.updateClipAudioEnvelope,
    applyMediaClipVisualsToTrack: state.applyMediaClipVisualsToTrack,
    applyEffectDocument: state.applyEffectDocument,
    convertTextClipToAnnotation: state.convertTextClipToAnnotation,
    updateActionEventDetails: state.updateActionEventDetails,
    updateCursorSampleInterpolation: state.updateCursorSampleInterpolation,
    updateCursorSampleSkinOverride: state.updateCursorSampleSkinOverride,
    updateCursorSampleVisibility: state.updateCursorSampleVisibility,
    updateMediaClipFitMode: state.updateMediaClipFitMode,
    updateMediaClipFitScalePercent: state.updateMediaClipFitScalePercent,
    updateMediaClipShadowIntensity: state.updateMediaClipShadowIntensity,
    updateMediaClipShadowMode: state.updateMediaClipShadowMode,
    updateMotionRegion: state.updateMotionRegion,
    updateAnnotationClipContent: state.updateAnnotationClipContent,
    updateAnnotationClipStyle: state.updateAnnotationClipStyle,
    updateAnnotationClipTemplate: state.updateAnnotationClipTemplate,
    updateShapeClipStyle: state.updateShapeClipStyle,
    updateSubtitleTrackStyle: state.updateSubtitleTrackStyle,
    updateTextClipContent: state.updateTextClipContent,
    updateTextClipStyle: state.updateTextClipStyle,
    updateTransitionDuration: state.updateTransitionDuration,
    updateTransitionEasing: state.updateTransitionEasing,
    updateTransitionTemplate: state.updateTransitionTemplate,
    deleteEffectInstance: state.deleteEffectInstance,
    duplicateEffectInstance: state.duplicateEffectInstance,
    moveEffectInstance: state.moveEffectInstance,
    updateEffectInstance: state.updateEffectInstance,
  };
}

function selectVideoEditorShellStoreSlice(state: VideoEditorState) {
  return {
    closeExportDialog: state.closeExportDialog,
    error: state.error,
    exportState: state.exportState,
    isReady: state.isReady,
    project: state.project,
    saveState: state.saveState,
    updateExportSettings: state.updateExportSettings,
  };
}

function selectVideoEditorActionStoreSlice(state: VideoEditorState) {
  return {
    addAssetClip: state.addAssetClip,
    cancelExport: state.cancelExport,
    failExportCancellation: state.failExportCancellation,
    failExport: state.failExport,
    startExport: state.startExport,
    startActionPointPlacement: state.startActionPointPlacement,
    startMotionAreaPlacement: state.startMotionAreaPlacement,
    startMotionFocusPlacement: state.startMotionFocusPlacement,
    startMotionPathStopAreaPlacement: state.startMotionPathStopAreaPlacement,
    startMotionPathStopPointPlacement: state.startMotionPathStopPointPlacement,
    startObjectTrackAnchorPlacement: state.startObjectTrackAnchorPlacement,
    upsertAsset: state.upsertAsset,
    upsertObjectTrack: state.upsertObjectTrack,
    upsertObjectTrackCorrectionAnchor: state.upsertObjectTrackCorrectionAnchor,
  };
}

function selectVideoEditorControllerStorePort(
  state: VideoEditorState
): VideoEditorControllerStorePort {
  return {
    ...selectVideoEditorRuntimeStoreSlice(state),
    ...selectVideoEditorWorkspaceSceneStoreSlice(state),
    ...selectVideoEditorWorkspaceSelectionStoreSlice(state),
    ...selectVideoEditorShellStoreSlice(state),
    ...selectVideoEditorActionStoreSlice(state),
  };
}

export function useVideoEditorControllerStorePort(): VideoEditorControllerStorePort {
  return useVideoEditorStore(useShallow(selectVideoEditorControllerStorePort));
}

export function getCurrentVideoEditorProjectId(): string | null {
  return useVideoEditorStore.getState().project?.id ?? null;
}

export function getCurrentVideoEditorExportJobId(): string | null {
  return useVideoEditorStore.getState().exportState.jobId;
}
