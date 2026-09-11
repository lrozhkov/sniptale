import type { ComponentProps } from 'react';
import { vi } from 'vitest';
import type { ProjectTimeline } from './index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { createSceneSelection } from '../../project/selection/model';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';

export function createTimelineTestProps(): ComponentProps<typeof ProjectTimeline> {
  const project = createEmptyVideoProject('Precise montage');
  project.fps = 240;
  project.duration = 86400;
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 160,
      height: 90,
      duration: 4,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  project.clips = [
    {
      ...createVideoClipFromAsset(project.tracks[0]!.id, asset, 1920, 1080, 43200),
      id: 'clip',
      duration: 1 / 240,
    },
  ];
  project.motionRegions = [
    { ...createVideoProjectMotionRegion(project, 43200), id: 'motion', duration: 1 / 240 },
  ];
  const idle = () => {};
  return {
    project,
    currentTime: 43200,
    pixelsPerSecond: 23040,
    isPlaying: false,
    magnetEnabled: false,
    playbackRange: { start: 43200, end: 43200 + 1 / 240 },
    recordingTelemetry: [],
    selection: createSceneSelection(),
    selectedClipId: 'clip',
    selectedTrackId: null,
    timelinePreviews: {},
    canDeleteSelectedClip: true,
    canEditSelectedClip: true,
    canSplitSelectedClip: false,
    panelPrefs: {
      prefs: DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
      cursorLaneVisible: false,
      telemetryLaneVisible: false,
      setCollapsedCursorLaneVisible: idle,
      setCollapsedTelemetryLaneVisible: idle,
      setCompactRows: idle,
      setHideTrackNames: idle,
      setFxCollapsed: idle,
      setClipNamesHidden: idle,
      setTrackHeight: idle,
    },
    historyTransaction: {
      beginProjectHistoryTransaction: () => Symbol('gesture'),
      endProjectHistoryTransaction: vi.fn(),
      isProjectHistoryTransactionCurrent: () => true,
    },
    insertion: {
      onAddActionEvent: idle,
      onAddMotionRegion: idle,
      onAddShapeOverlay: idle,
      onAddTextOverlay: idle,
      onAddTrack: idle,
      onEnableCursorTrack: idle,
      onImport: { audio: idle, image: idle, video: idle },
      onUnsupportedFileDrop: idle,
    },
    onSeekToEnd: idle,
    onSeekToStart: idle,
    onTogglePlay: idle,
    onClearPlaybackRange: vi.fn(),
    onStepToNextFrame: idle,
    onStepToPreviousFrame: idle,
    onSeek: vi.fn(),
    onZoomChange: idle,
    onSetPlaybackRange: vi.fn(),
    onSelectScene: idle,
    onSelectClip: idle,
    onSelectTrack: idle,
    onSelectTransition: idle,
    onSelectCursorSegment: idle,
    onSelectActionOccurrence: idle,
    onSelectMotionRegion: idle,
    onSelectObjectTrack: idle,
    onSwapClip: idle,
    onMoveClip: vi.fn(() => null),
    onCloseTrackGap: idle,
    onAddTrackLogicalLane: idle,
    onRenameTrack: idle,
    onTrimClipStart: () => null,
    onTrimClipEnd: () => null,
    onSplitSelectedClip: idle,
    onDuplicateSelectedClip: idle,
    onDeleteSelectedClip: idle,
    onUpdateSelectedClipPlaybackRate: idle,
    onAutoProcessingModalVisibilityChange: vi.fn(),
    autoProcessing: {
      prepare: async () => ({ status: 'stale' as const }),
      apply: async () => 'stale' as const,
      isCurrent: () => false,
    },
    onDeleteSelectedTimelineObject: idle,
    onToggleUtilityLaneVisibility: idle,
    onToggleUtilityLaneLock: idle,
    onClearUtilityLane: idle,
    onMoveCursorSegment: idle,
    onMoveTransitionSegment: idle,
    onMoveMotionRegion: vi.fn(),
    onResizeMotionRegion: idle,
    onUpdateEffectInstance: idle,
    onToggleTrackVisibility: idle,
    onToggleTrackLock: idle,
    onTimelinePreviewSuspendedChange: idle,
    onTimelinePreviewViewportChange: vi.fn(),
  };
}
