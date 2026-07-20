import { createRef } from 'react';
import { vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import { createSceneSelection } from '../../project/selection/model';
import { createSidebarController } from './top-panels-sidebar.test-support';

const noop = () => vi.fn();
type TimelineActions = VideoEditorWorkspaceController['timeline']['actions'];

function createInsertionActions(): VideoEditorWorkspaceController['timeline']['actions']['insertion'] {
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

function createHeaderController(): VideoEditorWorkspaceController['header'] {
  return {
    grid: { magnetEnabled: true, onToggleMagnet: noop() },
    inspectorMode: 'grid',
    leftSidebarCollapsed: false,
    libraryPanelOpen: false,
    onCloseLibraryPanel: noop(),
    onOpenAudioRecordingDialog: noop(),
    onOpenExportDialog: noop(),
    onOpenGridSettings: noop(),
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
  | 'onSelectActionSegment'
  | 'onSelectClip'
  | 'onSelectCursorSegment'
  | 'onSelectMotionRegion'
  | 'onSelectObjectTrack'
  | 'onSelectScene'
  | 'onSelectTrack'
  | 'onSelectTransition'
> {
  return {
    onSelectActionSegment: noop(),
    onSelectClip: noop(),
    onSelectCursorSegment: noop(),
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
    onAddTrackLogicalLane: noop(),
    onAutoTransformRecording: noop(),
    onClearPlaybackRange: noop(),
    onClearUtilityLane: noop(),
    onCloseTrackGap: noop(),
    onDeleteSelectedClip: noop(),
    onDeleteSelectedTimelineObject: noop(),
    onDeleteTrack: noop(),
    onDuplicateSelectedClip: noop(),
    onMoveActionEvent: noop(),
    onMoveClip: noop(),
    onMoveCursorSegment: noop(),
    onMoveMotionRegion: noop(),
    onMoveTrack: noop(),
    onMoveTransitionSegment: noop(),
    onRenameTrack: noop(),
    onResizeActionEvent: noop(),
    onResizeMotionRegion: noop(),
    onSeek: noop(),
    onSeekToStart: noop(),
    onSetPlaybackRange: noop(),
    onSplitSelectedClip: noop(),
    onTimelinePreviewSuspendedChange: noop(),
    onTimelinePreviewViewportChange: noop(),
    onTogglePlay: noop(),
    onToggleTelemetryLaneVisibility: noop(),
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
  insertion: VideoEditorWorkspaceController['timeline']['actions']['insertion']
): VideoEditorWorkspaceController['timeline'] {
  return {
    actions: {
      insertion,
      ...createTimelineEditActions(),
      ...createTimelineSelectionActions(),
    },
    state: {
      currentTime: 0,
      isPlaying: false,
      magnetEnabled: true,
      pixelsPerSecond: 90,
      playbackRange: null,
      project,
      recordingTelemetry: null,
      selectedClipId: null,
      selectedTrackId: null,
      selection: createSceneSelection(),
      telemetryLaneVisible: false,
      timelinePreviews: {},
    },
  };
}

function createPreviewController(
  project: ReturnType<typeof createEmptyVideoProject>,
  insertion: VideoEditorWorkspaceController['timeline']['actions']['insertion']
): VideoEditorWorkspaceController['preview'] {
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
    selectedActionEvent: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    onSelectClip: noop(),
    onSelectScene: noop(),
  };
}

export function createFloatingWorkspaceController(): VideoEditorWorkspaceController {
  const project = createEmptyVideoProject('Floating workspace');
  const insertion = createInsertionActions();

  return {
    diagnostics: { isOpen: false, onClose: noop(), recordingId: null },
    header: createHeaderController(),
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
