import { createRef } from 'react';
import { vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorHeaderController } from '../../runtime/controller/contracts/header';
import type { VideoEditorPreviewController } from '../../runtime/controller/contracts/preview';
import type { VideoEditorTimelineController } from '../../runtime/controller/contracts/timeline';
import { createSceneSelection } from '../../project/selection/model';
import { createSidebarController } from './top-panels-sidebar.test-support';

const noop = () => vi.fn();
type TimelineActions = VideoEditorTimelineController['actions'];

function createInsertionActions(): VideoEditorTimelineController['actions']['insertion'] {
  return {
    onAddActionEvent: noop(),
    onAddAnnotationOverlay: noop(),
    onAddMotionRegion: noop(),
    onAddShapeOverlay: noop(),
    onAddTextOverlay: vi.fn(() => null),
    onAddTrack: noop(),
    onEnableCursorTrack: noop(),
    onImport: {
      audio: noop(),
      image: noop(),
      video: noop(),
    },
    onUnsupportedFileDrop: noop(),
  };
}

function createHeaderController(): VideoEditorHeaderController {
  return {
    grid: { magnetEnabled: true, onToggleMagnet: noop() },
    inspectorMode: 'selection',
    leftSidebarCollapsed: false,
    libraryPanelOpen: false,
    onCloseLibraryPanel: noop(),
    onOpenAudioRecordingDialog: noop(),
    onOpenExportDialog: noop(),
    onOpenLibraryPanel: noop(),
    onRenameProject: noop(),
    onSelectScene: noop(),
    onToggleLibraryPanel: noop(),
    onToggleSidebar: noop(),
    projectExportsCount: 0,
    projectName: 'Floating workspace',
    saveStateMeta: { className: 'is-saved', label: 'Saved' },
  };
}

function createTimelineSelectionActions(): Pick<
  TimelineActions,
  | 'onSelectActionOccurrence'
  | 'onSelectClip'
  | 'onSelectCursorSegment'
  | 'onSelectHistoryLane'
  | 'onSelectMotionLane'
  | 'onSelectMotionRegion'
  | 'onSelectObjectTrack'
  | 'onSelectScene'
  | 'onSelectTrack'
  | 'onSelectTransition'
> {
  return {
    onSelectActionOccurrence: noop(),
    onSelectClip: noop(),
    onSelectCursorSegment: noop(),
    onSelectHistoryLane: noop(),
    onSelectMotionLane: noop(),
    onSelectMotionRegion: noop(),
    onSelectObjectTrack: noop(),
    onSelectScene: noop(),
    onSelectTrack: noop(),
    onSelectTransition: noop(),
  };
}

function createTimelineEditActions(): Omit<
  TimelineActions,
  'insertion' | keyof ReturnType<typeof createTimelineSelectionActions>
> {
  return {
    historyTransaction: {
      beginProjectHistoryTransaction: () => Symbol('test-history-transaction'),
      endProjectHistoryTransaction: noop(),
      isProjectHistoryTransactionCurrent: () => true,
    },
    onAddTrackLogicalLane: noop(),
    onConnectMotionRegions: noop(),
    onAutoProcessingModalVisibilityChange: noop(),
    autoProcessing: {
      prepare: async () => ({ status: 'stale' as const }),
      apply: async () => 'stale' as const,
      isCurrent: () => false,
    },
    onClearUtilityLane: noop(),
    onCloseTrackGap: noop(),
    onDeleteSelectedClip: noop(),
    onDeleteSelectedTimelineObject: noop(),
    onDeleteTrack: noop(),
    onDuplicateSelectedClip: noop(),
    onSwapClip: vi.fn(),
    onMoveClip: noop(),
    onMoveCursorSegment: noop(),
    onMoveMotionRegion: noop(),
    onMoveTrack: noop(),
    onMoveTransitionSegment: noop(),
    onRenameTrack: noop(),
    onResizeMotionRegion: noop(),
    onSeek: noop(),
    onClearPlaybackRange: noop(),
    onSeekToEnd: noop(),
    onSeekToStart: noop(),
    onStepToNextFrame: noop(),
    onStepToPreviousFrame: noop(),
    onSetPlaybackRange: noop(),
    onSplitSelectedClip: noop(),
    onTimelinePreviewSuspendedChange: noop(),
    onTimelinePreviewViewportChange: noop(),
    onTogglePlay: noop(),
    onToggleTrackLock: noop(),
    onToggleTrackVisibility: noop(),
    onToggleUtilityLaneLock: noop(),
    onToggleUtilityLaneVisibility: noop(),
    onTrimClipEnd: noop(),
    onTrimClipStart: noop(),
    onUpdateSelectedClipPlaybackRate: noop(),
    onUpdateEffectInstance: noop(),
    onZoomChange: noop(),
  };
}

function createTimelineController(
  project: ReturnType<typeof createEmptyVideoProject>,
  insertion: VideoEditorTimelineController['actions']['insertion']
): VideoEditorTimelineController {
  return {
    actions: {
      insertion,
      ...createTimelineEditActions(),
      ...createTimelineSelectionActions(),
    },
    state: {
      canDeleteSelectedClip: false,
      canEditSelectedClip: false,
      canSplitSelectedClip: false,
      currentTime: 0,
      isPlaying: false,
      magnetEnabled: true,
      pixelsPerSecond: 90,
      playbackRange: null,
      project,
      recordingTelemetry: [],
      selectedClipId: null,
      selectedTrackId: null,
      selection: createSceneSelection(),
      timelinePreviews: {},
    },
  };
}

function createPreviewController(
  project: ReturnType<typeof createEmptyVideoProject>,
  insertion: VideoEditorTimelineController['actions']['insertion']
): VideoEditorPreviewController {
  const { onImport, ...editing } = insertion;
  return {
    assetUrls: {},
    editing: {
      ...editing,
      onUpdateAnnotationClipTemplate: noop(),
      onUpdateClipTransform: noop(),
    },
    grid: {
      color: '#94a3b8',
      enabled: false,
      magnetEnabled: true,
      size: 80,
      snapEnabled: true,
    },
    onImport,
    pointAuthoring: {
      onClearPlacementMode: noop(),
      onUpdateActionEventDetails: noop(),
      onUpdateMotionRegion: noop(),
      onUpsertObjectTrackCorrectionAnchor: noop(),
    },
    preferences: createFloatingPreviewPreferences(),
    project,
    selection: createFloatingPreviewSelection(),
    transport: {
      currentTime: 0,
      isPlaying: false,
      onPausePlayback: noop(),
      onSeek: noop(),
      onTogglePlay: noop(),
      playbackRange: null,
      registerPreviewRuntime: noop(),
    },
  };
}

function createFloatingPreviewPreferences() {
  return {
    mode: 'live' as const,
    onModeChange: noop(),
    onRasterPresetChange: noop(),
    onRetrySave: noop(),
    onZoomChange: noop(),
    rasterPreset: '720p' as const,
    saveFailed: false,
    zoom: 'fit' as const,
  };
}

function createFloatingPreviewSelection() {
  return {
    placementMode: null,
    selectedActionOccurrence: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    onSelectClip: noop(),
    onSelectScene: noop(),
  };
}

export function createFloatingWorkspaceController() {
  const project = createEmptyVideoProject('Floating workspace');
  const insertion = createInsertionActions();

  return {
    diagnostics: { isOpen: false, onClose: noop(), recordingId: null },
    header: createHeaderController(),
    history: {
      canUndo: false,
      canRedo: false,
      error: null,
      onUndo: noop(),
      onRedo: noop(),
    },
    layout: {
      audioRecordingDialogOpen: false,
      closeAudioRecordingDialog: noop(),
      handleStartVerticalResize: noop(),
      leftSidebarCollapsed: false,
      openAudioRecordingDialog: noop(),
      previewPaneHeight: null,
      toggleSidebarCollapsed: noop(),
      workspaceSplitRef: createRef<HTMLDivElement>(),
    },
    preview: createPreviewController(project, insertion),
    sidebar: createSidebarController(project),
    timeline: createTimelineController(project, insertion),
  };
}
