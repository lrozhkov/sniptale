import { resolveMotionConnectionSource } from '../../../../features/video/project/motion';
import { VideoTemporalEasing } from '../../../../features/video/project/types';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import { getClipEndTime } from '../../../../features/video/project/timeline';
import { getProjectTransitionById } from '../../../../features/video/project/transition/project';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { VideoProjectInteractionTimeBasis } from '../../../../features/video/project/types';
import type { VideoEditorRuntimeController } from '../../session';
import type {
  ClipSelectionPort,
  HistoryPort,
  ProjectLifecyclePort,
  TimelineEditingPort,
} from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import { createTimelineTrackActions } from './timeline-track-actions';
import { createAutoProcessingActions } from './timeline-auto-transform';
import { getCurrentVideoEditorProjectSnapshot } from '../store';

type TimelineWorkspace = Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'confirm' | 'inspector' | 'playbackRange' | 'setPlaybackRange'
>;
type SelectedClipActions = {
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  splitSelectedClip: () => void;
};

type TimelineActionStore = TimelineEditingPort &
  ClipSelectionPort &
  Pick<
    HistoryPort,
    | 'beginProjectHistoryTransaction'
    | 'endProjectHistoryTransaction'
    | 'isProjectHistoryTransactionCurrent'
  > &
  Pick<ProjectLifecyclePort, 'project' | 'setError'>;

function moveInteractionToProjectTime<
  T extends { sourceAnchor?: unknown; time: number; timeBasis?: unknown },
>(interaction: T, time: number): T {
  const nextInteraction = {
    ...interaction,
    time,
    timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
  };
  delete nextInteraction.sourceAnchor;
  return nextInteraction;
}

function createCursorSegmentMover(store: TimelineActionStore) {
  return (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => {
    store.updateProject((project) => {
      const cursorTrack = project.cursorTrack;
      if (!cursorTrack) {
        return project;
      }

      return {
        ...project,
        cursorTrack: {
          ...cursorTrack,
          samples: cursorTrack.samples
            .map((sample) => {
              if (sample.id === sampleId) {
                return moveInteractionToProjectTime(sample, startTime);
              }

              if (sample.id === nextSampleId && endTime !== null) {
                return moveInteractionToProjectTime(sample, endTime);
              }

              return sample;
            })
            .sort((left, right) => left.time - right.time),
        },
      };
    });
  };
}

function createTransitionMover(store: TimelineActionStore) {
  return (transitionId: string, startTime: number) => {
    const project = store.project;
    if (!project) {
      return;
    }

    const transition = getProjectTransitionById(project, transitionId);
    const leadingClip = project.clips.find((clip) => clip.id === transition?.leadingClipId);
    if (!transition || !leadingClip) {
      return;
    }

    const maxStartTime = getClipEndTime(leadingClip) - 0.1;
    store.moveClip(transition.trailingClipId, Math.min(startTime, maxStartTime));
  };
}

function createMotionRegionMover(store: TimelineActionStore) {
  return (motionRegionId: string, startTime: number) =>
    store.updateMotionRegion(motionRegionId, { startTime });
}

function createMotionRegionResizer(store: TimelineActionStore) {
  return (motionRegionId: string, startTime: number, duration: number) =>
    store.updateMotionRegion(motionRegionId, { startTime, duration });
}

function deleteSelectedTimelineObject(
  selection: ClipSelectionPort['selection'],
  store: TimelineActionStore,
  selectedClipActions: Pick<SelectedClipActions, 'deleteSelectedClip'>
) {
  switch (selection.kind) {
    case VideoEditorSelectionKind.MOTION_CONNECTION:
      store.updateMotionRegion(selection.motionRegionId, { incomingConnection: null });
      return;
    case VideoEditorSelectionKind.HISTORY_SPAN:
    case VideoEditorSelectionKind.HISTORY_LANE:
    case VideoEditorSelectionKind.MOTION_LANE:
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.TRACK:
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return;
    case VideoEditorSelectionKind.CLIP_GROUP:
    case VideoEditorSelectionKind.CLIP:
      selectedClipActions.deleteSelectedClip();
      return;
    case VideoEditorSelectionKind.ACTION_OCCURRENCE: {
      const event = store.project?.actionEvents.find((item) => item.id === selection.eventId);
      if (event)
        store.updateActionEventDetails(event.id, {
          presentation: { ...event.presentation, enabled: false },
        });
      return;
    }
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      store.deleteCursorSample(selection.sampleId);
      return;
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return store.deleteObjectTrack(selection.objectTrackId);
    case VideoEditorSelectionKind.MOTION_REGION:
      store.deleteMotionRegion(selection.motionRegionId);
      return;
  }
}

export function createWorkspaceTimelineEditingActions(
  store: TimelineActionStore,
  workspace: TimelineWorkspace,
  selectedClipActions: SelectedClipActions
) {
  return {
    historyTransaction: {
      beginProjectHistoryTransaction: store.beginProjectHistoryTransaction,
      endProjectHistoryTransaction: store.endProjectHistoryTransaction,
      isProjectHistoryTransactionCurrent: store.isProjectHistoryTransactionCurrent,
    },
    onDeleteSelectedClip: selectedClipActions.deleteSelectedClip,
    onDeleteSelectedTimelineObject: () =>
      deleteSelectedTimelineObject(store.selection, store, selectedClipActions),
    onDuplicateSelectedClip: selectedClipActions.duplicateSelectedClip,
    onUpdateSelectedClipPlaybackRate: createSelectedClipPlaybackRateAction(store),
    autoProcessing: createAutoProcessingActions(store, getCurrentVideoEditorProjectSnapshot),
    onCloseTrackGap: store.closeTrackGap,
    onSwapClip: store.swapClip,
    onMoveClip: store.moveClip,
    onRenameTrack: store.renameTrack,
    onMoveCursorSegment: createCursorSegmentMover(store),
    onMoveActionOccurrence: (eventId: string, clipId: string | null, time: number) =>
      store.updateActionEventDetails(eventId, { clipId, time }),
    onMoveMotionRegion: createMotionRegionMover(store),
    onResizeMotionRegion: createMotionRegionResizer(store),
    ...createTimelineTrackActions(store, workspace),
    onToggleUtilityLaneVisibility: store.toggleUtilityLaneVisibility,
    onToggleUtilityLaneLock: store.toggleUtilityLaneLock,
    onClearUtilityLane: store.clearUtilityLane,
    onMoveTransitionSegment: createTransitionMover(store),
    onSplitSelectedClip: selectedClipActions.splitSelectedClip,
    onTrimClipEnd: store.trimClipEnd,
    onTrimClipStart: store.trimClipStart,
  };
}

function createSelectedClipPlaybackRateAction(store: TimelineActionStore) {
  return (playbackRate: number) => {
    if (!store.selectedClipId) {
      return;
    }

    store.updateClipPlaybackRate(store.selectedClipId, playbackRate);
  };
}

export function createWorkspaceTimelineSelectionActions(
  store: TimelineActionStore,
  runtime: VideoEditorRuntimeController,
  workspace: TimelineWorkspace
) {
  const selectWithInspector = <Args extends unknown[]>(
    select: (...args: Args) => void
  ): ((...args: Args) => void) => {
    return (...args: Args) => {
      select(...args);
      workspace.inspector.openSelection();
    };
  };
  const seekOutsideRange = (time: number) => {
    const range = workspace.playbackRange;
    if (range && (time < range.start || time > range.end)) workspace.clearPlaybackRange();
    runtime.seekTo(time);
  };
  return {
    onSeek: seekOutsideRange,
    onSeekToEnd: () => seekOutsideRange(store.project?.duration ?? 0),
    onSeekToStart: () => seekOutsideRange(0),
    onStepToNextFrame: () => runtime.stepByFrames(1),
    onStepToPreviousFrame: () => runtime.stepByFrames(-1),
    onSetPlaybackRange: workspace.setPlaybackRange,
    onClearPlaybackRange: workspace.clearPlaybackRange,
    onSelectHistorySpan: selectWithInspector(store.selectHistorySpan),
    onSelectActionOccurrence: selectWithInspector(store.selectActionOccurrence),
    onSelectClip: selectWithInspector(store.selectClip),
    onSelectCursorSegment: selectWithInspector(store.selectCursorSegment),
    onSelectMotionRegion: (motionRegionId: string, part?: 'connection') => {
      selectWithInspector(store.selectMotionRegion)(motionRegionId, part);
      const destination = store.project?.motionRegions?.find(
        (region) => region.id === motionRegionId
      );
      const source =
        destination && store.project
          ? resolveMotionConnectionSource(store.project, destination)
          : null;
      if (part && destination && source)
        seekOutsideRange((source.startTime + source.duration + destination.startTime) / 2);
    },
    onConnectMotionRegions: (fromRegionId: string, motionRegionId: string) => {
      const project = store.project;
      const destination = project?.motionRegions?.find((region) => region.id === motionRegionId);
      if (!project || !destination || isVideoProjectUtilityLaneLocked(project, 'camera')) return;
      const incomingConnection = { fromRegionId, easing: VideoTemporalEasing.EASE_IN_OUT };
      const source = resolveMotionConnectionSource(project, { ...destination, incomingConnection });
      if (!source) return;
      store.updateMotionRegion(motionRegionId, { incomingConnection });
      selectWithInspector(store.selectMotionRegion)(motionRegionId, 'connection');
      seekOutsideRange((source.startTime + source.duration + destination.startTime) / 2);
    },
    onSelectHistoryLane: selectWithInspector(store.selectHistoryLane),
    onSelectMotionLane: selectWithInspector(store.selectMotionLane),
    onSelectObjectTrack: selectWithInspector(store.selectObjectTrack),
    onSelectScene: selectWithInspector(store.selectScene),
    onSelectTrack: selectWithInspector(store.selectTrack),
    onSelectTransition: selectWithInspector(store.selectTransition),
    onTogglePlay: runtime.togglePlayback,
    onZoomChange: store.setPixelsPerSecond,
  };
}
