import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { normalizeVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { getClipEndTime } from '../../../../features/video/project/timeline';
import { getProjectTransitionById } from '../../../../features/video/project/transition/project';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { VideoProjectInteractionTimeBasis } from '../../../../features/video/project/types';
import type { VideoEditorRuntimeController } from '../../session';
import type {
  ClipSelectionPort,
  RecordingTelemetryPort,
  HistoryPort,
  ProjectLifecyclePort,
  TimelineEditingPort,
} from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import { createTimelineTrackActions } from './timeline-track-actions';
import { createAutoTransformRecordingAction } from './timeline-auto-transform';
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
  Pick<RecordingTelemetryPort, 'toggleTelemetryLaneVisibility'> &
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

function createActionEventMover(store: TimelineActionStore) {
  return (actionEventId: string, time: number) => {
    store.updateProject((project) => ({
      ...project,
      actionEvents: project.actionEvents.map((event) =>
        event.id === actionEventId
          ? moveInteractionToProjectTime(event, clampNumber(time, 0, project.duration))
          : event
      ),
    }));
  };
}

function createActionEventResizer(store: TimelineActionStore) {
  return (actionEventId: string, duration: number) => {
    store.updateActionEventDetails(actionEventId, { duration });
  };
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
  return (motionRegionId: string, startTime: number) => {
    store.updateProject((project) => ({
      ...project,
      motionRegions: (project.motionRegions ?? []).map((region) =>
        region.id === motionRegionId
          ? normalizeVideoProjectMotionRegion(project, { ...region, startTime })
          : region
      ),
    }));
  };
}

function createMotionRegionResizer(store: TimelineActionStore) {
  return (motionRegionId: string, startTime: number, duration: number) => {
    store.updateProject((project) => ({
      ...project,
      motionRegions: (project.motionRegions ?? []).map((region) =>
        region.id === motionRegionId
          ? normalizeVideoProjectMotionRegion(project, { ...region, duration, startTime })
          : region
      ),
    }));
  };
}

function deleteSelectedTimelineObject(
  selection: ClipSelectionPort['selection'],
  store: TimelineActionStore,
  selectedClipActions: Pick<SelectedClipActions, 'deleteSelectedClip'>
) {
  switch (selection.kind) {
    case VideoEditorSelectionKind.MOTION_LANE:
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.TRACK:
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return;
    case VideoEditorSelectionKind.CLIP:
      selectedClipActions.deleteSelectedClip();
      return;
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      store.deleteActionEvent(selection.actionEventId);
      return;
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
    onAutoTransformRecording: createAutoTransformRecordingAction(
      store,
      getCurrentVideoEditorProjectSnapshot
    ),
    onMoveActionEvent: createActionEventMover(store),
    onResizeActionEvent: createActionEventResizer(store),
    onCloseTrackGap: store.closeTrackGap,
    onSwapClip: store.swapClip,
    onMoveClip: store.moveClip,
    onRenameTrack: store.renameTrack,
    onMoveCursorSegment: createCursorSegmentMover(store),
    onMoveMotionRegion: createMotionRegionMover(store),
    onResizeMotionRegion: createMotionRegionResizer(store),
    ...createTimelineTrackActions(store, workspace),
    onToggleUtilityLaneVisibility: store.toggleUtilityLaneVisibility,
    onToggleUtilityLaneLock: store.toggleUtilityLaneLock,
    onClearUtilityLane: store.clearUtilityLane,
    onMoveTransitionSegment: createTransitionMover(store),
    onSplitSelectedClip: selectedClipActions.splitSelectedClip,
    onToggleTelemetryLaneVisibility: store.toggleTelemetryLaneVisibility,
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
    onSelectActionSegment: selectWithInspector(store.selectActionSegment),
    onSelectClip: selectWithInspector(store.selectClip),
    onSelectCursorSegment: selectWithInspector(store.selectCursorSegment),
    onSelectMotionRegion: selectWithInspector(store.selectMotionRegion),
    onSelectMotionLane: selectWithInspector(store.selectMotionLane),
    onSelectObjectTrack: selectWithInspector(store.selectObjectTrack),
    onSelectScene: selectWithInspector(store.selectScene),
    onSelectTrack: selectWithInspector(store.selectTrack),
    onSelectTransition: selectWithInspector(store.selectTransition),
    onTogglePlay: runtime.togglePlayback,
    onZoomChange: store.setPixelsPerSecond,
  };
}
