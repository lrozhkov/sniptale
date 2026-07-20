import { vi } from 'vitest';
import type { VideoEditorState } from '../../state/store';
import type { VideoEditorActionHandlers } from '../commands';

export const BUILDER_STORE_ACTION_NAMES = [
  'setProject',
  'setRecordingTelemetry',
  'updateProject',
  'setReady',
  'setError',
  'setSaveState',
  'setCurrentTime',
  'setPlaying',
  'togglePlaying',
  'toggleTelemetryLaneVisibility',
  'setPixelsPerSecond',
  'clearPlacementMode',
  'selectScene',
  'selectTrack',
  'selectClip',
  'selectTransition',
  'selectCursorSegment',
  'selectObjectTrack',
  'selectActionSegment',
  'selectMotionRegion',
  'startActionPointPlacement',
  'startMotionAreaPlacement',
  'startMotionFocusPlacement',
  'startMotionPathStopAreaPlacement',
  'startMotionPathStopPointPlacement',
  'startObjectTrackAnchorPlacement',
  'setDiagnosticsOpen',
  'renameProject',
  'renameTrack',
  'addTrackLogicalLane',
  'addTrack',
  'deleteTrack',
  'moveTrack',
  'toggleTrackVisibility',
  'toggleTrackLock',
  'toggleUtilityLaneVisibility',
  'toggleUtilityLaneLock',
  'clearUtilityLane',
  'upsertAsset',
  'addAssetClip',
  'addAnnotationOverlay',
  'addVideoBlock',
  'addSubtitleOverlay',
  'addTextOverlay',
  'addShapeOverlay',
  'moveClip',
  'closeTrackGap',
  'trimClipStart',
  'trimClipEnd',
  'splitClipAt',
  'deleteClip',
  'duplicateClip',
  'detachClipGroup',
  'updateClipTransform',
  'updateClipMuted',
  'updateClipVolume',
  'updateClipAudioEnvelope',
  'updateClipFades',
  'updateClipPlaybackRate',
  'updateClipTransitions',
  'applyMediaClipVisualsToTrack',
  'applyEffectDocument',
  'deleteEffectInstance',
  'duplicateEffectInstance',
  'moveEffectInstance',
  'updateEffectInstance',
  'upsertObjectTrack',
  'upsertObjectTrackCorrectionAnchor',
  'deleteObjectTrack',
  'convertTextClipToAnnotation',
  'updateMediaClipFitMode',
  'updateMediaClipFitScalePercent',
  'updateMediaClipShadowIntensity',
  'updateMediaClipShadowMode',
  'updateTextClipContent',
  'updateTextClipStyle',
  'updateAnnotationClipContent',
  'updateAnnotationClipStyle',
  'updateAnnotationClipTemplate',
  'updateSubtitleTrackStyle',
  'updateShapeClipStyle',
  'updateTransitionDuration',
  'updateTransitionEasing',
  'updateTransitionTemplate',
  'insertCursorSample',
  'deleteCursorSample',
  'clearCursorSampleSkinOverride',
  'updateCursorSampleInterpolation',
  'updateCursorSampleSkinOverride',
  'updateCursorSampleVisibility',
  'deleteActionEvent',
  'updateActionEventDetails',
  'deleteMotionRegion',
  'updateMotionRegion',
  'openExportDialog',
  'closeExportDialog',
  'updateExportSettings',
  'startExport',
  'updateExportStatus',
  'failExport',
  'failExportCancellation',
  'completeExport',
  'cancelExport',
] as const;

export function createBuilderRuntimeState() {
  return {
    applyLoadedProject: vi.fn(),
    assetUrls: { asset: 'blob:asset' },
    timelinePreviews: {},
    pausePlayback: vi.fn(() => 0),
    registerPreviewRuntime: vi.fn(),
    seekTo: vi.fn(),
    setTimelinePreviewSuspended: vi.fn(),
    setTimelinePreviewViewport: vi.fn(),
    setPlaybackPlaying: vi.fn(),
    togglePlayback: vi.fn(),
  };
}

export function createBuilderWorkspaceState() {
  return {
    ...createBuilderWorkspaceShellState(),
    ...createBuilderWorkspaceActions(),
  };
}

function createBuilderWorkspaceShellState() {
  return {
    confirm: {
      dialog: null,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      request: vi.fn(),
    },
    audioRecordingDialogOpen: false,
    inspector: {
      mode: 'selection' as const,
      openGridSettings: vi.fn(),
      openSelection: vi.fn(),
    },
    libraryPanelOpen: false,
    leftSidebarCollapsed: false,
    grid: {
      gridColor: '#94a3b8',
      gridEnabled: false,
      gridPopoverOpen: false,
      gridSize: 80,
      gridSnapEnabled: true,
      magnetEnabled: true,
      workspacePopoverOpen: false,
      closeGridPopover: vi.fn(),
      closeWorkspacePopover: vi.fn(),
      setGridColor: vi.fn(),
      setGridEnabled: vi.fn(),
      setGridSize: vi.fn(),
      setGridSnapEnabled: vi.fn(),
      toggleGridPopover: vi.fn(),
      toggleMagnet: vi.fn(),
      toggleWorkspacePopover: vi.fn(),
    },
    playbackRange: null,
    preview: createBuilderWorkspacePreviewState(),
    sceneBackgroundColors: {
      preview: null,
      recentColors: [],
      rememberRecentColor: vi.fn(async () => undefined),
      resetPreview: vi.fn(),
      setPreview: vi.fn(),
    },
  };
}

function createBuilderWorkspacePreviewState() {
  return {
    handleStartVerticalResize: vi.fn(),
    paneHeight: 320,
    preferences: {
      preferences: {
        mode: 'live' as const,
        rasterPreset: '720p' as const,
        zoom: 'fit' as const,
      },
      retrySave: vi.fn(),
      saveFailed: false,
      updatePreferences: vi.fn(),
    },
    workspaceSplitRef: { current: null },
  };
}

function createBuilderWorkspaceActions() {
  return {
    clearPlaybackRange: vi.fn(),
    closeAudioRecordingDialog: vi.fn(),
    closeLibraryPanel: vi.fn(),
    openAudioRecordingDialog: vi.fn(),
    openLibraryPanel: vi.fn(),
    setPlaybackRange: vi.fn(),
    toggleLibraryPanel: vi.fn(),
    toggleSidebarCollapsed: vi.fn(),
  };
}

export function createBuilderActions(): VideoEditorActionHandlers {
  return {
    handleAddRecording: vi.fn(),
    handleCreateProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handleImportAudio: vi.fn(),
    handleImportImage: vi.fn(),
    handleImportRecordedAudio: vi.fn(),
    handleImportVideo: vi.fn(),
    handleOpenProject: vi.fn(),
    handleStartExport: vi.fn(),
    handleCancelExport: vi.fn(),
  };
}

export function createBuilderSelections(store: VideoEditorState) {
  return {
    selection: { kind: 'scene' } as const,
    selectedActionEvent: null,
    selectedClip: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedObjectTrack: null,
    selectedTrack: store.project!.tracks[0] ?? null,
    selectedTransition: null,
  };
}
