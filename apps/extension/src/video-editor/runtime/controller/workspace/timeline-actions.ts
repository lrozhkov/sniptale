import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { normalizeVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { getClipEndTime } from '../../../../features/video/project/timeline';
import { getProjectTransitionById } from '../../../../features/video/project/transition/project';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import { createTimelineTrackActions } from './timeline-track-actions';
import { createAutoTransformRecordingAction } from './timeline-auto-transform';

type TimelineWorkspace = Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'confirm' | 'inspector' | 'setPlaybackRange'
>;
type SelectedClipActions = {
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  splitSelectedClip: () => void;
};

function createActionEventMover(store: VideoEditorControllerStorePort) {
  return (actionEventId: string, time: number) => {
    store.updateProject((project) => ({
      ...project,
      actionEvents: project.actionEvents.map((event) =>
        event.id === actionEventId
          ? {
              ...event,
              time: clampNumber(time, 0, project.duration),
            }
          : event
      ),
    }));
  };
}

function createActionEventResizer(store: VideoEditorControllerStorePort) {
  return (actionEventId: string, duration: number) => {
    store.updateActionEventDetails(actionEventId, { duration });
  };
}

function createCursorSegmentMover(store: VideoEditorControllerStorePort) {
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
                return {
                  ...sample,
                  time: startTime,
                };
              }

              if (sample.id === nextSampleId && endTime !== null) {
                return {
                  ...sample,
                  time: endTime,
                };
              }

              return sample;
            })
            .sort((left, right) => left.time - right.time),
        },
      };
    });
  };
}

function createTransitionMover(store: VideoEditorControllerStorePort) {
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

function createMotionRegionMover(store: VideoEditorControllerStorePort) {
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

function createMotionRegionResizer(store: VideoEditorControllerStorePort) {
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
  selection: VideoEditorControllerStorePort['selection'],
  store: VideoEditorControllerStorePort,
  selectedClipActions: Pick<SelectedClipActions, 'deleteSelectedClip'>
) {
  switch (selection.kind) {
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
  store: VideoEditorControllerStorePort,
  workspace: TimelineWorkspace,
  selectedClipActions: SelectedClipActions
) {
  return {
    onClearPlaybackRange: workspace.clearPlaybackRange,
    onDeleteSelectedClip: selectedClipActions.deleteSelectedClip,
    onDeleteSelectedTimelineObject: () =>
      deleteSelectedTimelineObject(store.selection, store, selectedClipActions),
    onDuplicateSelectedClip: selectedClipActions.duplicateSelectedClip,
    onUpdateSelectedClipPlaybackRate: createSelectedClipPlaybackRateAction(store),
    onAutoTransformRecording: createAutoTransformRecordingAction(store),
    onMoveActionEvent: createActionEventMover(store),
    onResizeActionEvent: createActionEventResizer(store),
    onCloseTrackGap: store.closeTrackGap,
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

function createSelectedClipPlaybackRateAction(store: VideoEditorControllerStorePort) {
  return (playbackRate: number) => {
    if (!store.selectedClipId) {
      return;
    }

    store.updateClipPlaybackRate(store.selectedClipId, playbackRate);
  };
}

export function createWorkspaceTimelineSelectionActions(
  store: VideoEditorControllerStorePort,
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
  return {
    onSeek: runtime.seekTo,
    onSeekToStart: () => runtime.seekTo(0),
    onSetPlaybackRange: workspace.setPlaybackRange,
    onSelectActionSegment: selectWithInspector(store.selectActionSegment),
    onSelectClip: selectWithInspector(store.selectClip),
    onSelectCursorSegment: selectWithInspector(store.selectCursorSegment),
    onSelectMotionRegion: selectWithInspector(store.selectMotionRegion),
    onSelectObjectTrack: selectWithInspector(store.selectObjectTrack),
    onSelectScene: selectWithInspector(store.selectScene),
    onSelectTrack: selectWithInspector(store.selectTrack),
    onSelectTransition: selectWithInspector(store.selectTransition),
    onTogglePlay: runtime.togglePlayback,
    onZoomChange: store.setPixelsPerSecond,
  };
}
