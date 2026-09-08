import { resolveVideoProjectActionOccurrences } from '../../features/video/project/action-occurrences';
import { clampTimelineScale } from '../contracts/timeline-scale';
import type { StateCreator } from 'zustand';
import { clampNumber } from '../../features/video/project/hydration';
import { resolvePlacementModeAfterSelectionChange } from '../project/selection/placement';
import { createSceneSelection } from '../project/selection/model';
import { VideoEditorSelectionKind } from '../contracts/selection';
import { createPlacementStateActions } from './placement-actions';
import type { VideoEditorState } from './types';
import { resolveTypingSpanSource } from '../project/state/clip-timeline/source-range';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createSelectionStateActions(set: VideoEditorStoreSet) {
  return {
    clearPlacementMode: () => set({ placementMode: null }),
    setCurrentTime: (time: number) =>
      set((state): Partial<VideoEditorState> => ({
        currentTime: clampNumber(time, 0, Math.max(0, state.project?.duration ?? 0)),
      })),
    setPlaying: (isPlaying: boolean) => set({ isPlaying }),
    togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setPixelsPerSecond: (pixelsPerSecond: number) =>
      set({ pixelsPerSecond: clampTimelineScale(pixelsPerSecond) }),
    selectScene: createSelectSceneAction(set),
    selectTrack: createSelectTrackAction(set),
    selectClip: createSelectClipAction(set),
    selectTransition: createSelectTransitionAction(set),
    selectCursorSegment: createSelectCursorSegmentAction(set),
    selectObjectTrack: createSelectObjectTrackAction(set),
    selectActionOccurrence: createSelectActionOccurrenceAction(set),
    selectHistorySpan: ((target) =>
      set((state) => {
        if (
          !state.project ||
          !resolveTypingSpanSource(state.project, state.recordingTelemetry, target)
        )
          return state;
        return {
          selection: { kind: VideoEditorSelectionKind.HISTORY_SPAN, ...target },
          selectedTrackId: null,
          placementMode: null,
        };
      })) satisfies VideoEditorState['selectHistorySpan'],
    selectMotionRegion: createSelectMotionRegionAction(set),
    selectHistoryLane: () =>
      set((state) =>
        state.project
          ? {
              selection: { kind: VideoEditorSelectionKind.HISTORY_LANE },
              selectedTrackId: null,
              placementMode: null,
            }
          : state
      ),
    selectMotionLane: () =>
      set((state) =>
        (state.project?.motionRegions?.length ?? 0) > 0
          ? {
              selection: { kind: VideoEditorSelectionKind.MOTION_LANE },
              selectedTrackId: null,
              placementMode: null,
            }
          : state
      ),
    ...createPlacementStateActions(set),
  };
}

export function resolveInitialSelectedClipId(
  project: NonNullable<VideoEditorState['project']>
): string | null {
  return project.clips.find((clip) => clip.type !== 'AUDIO')?.id ?? project.clips[0]?.id ?? null;
}

export function resolveSelectedTrackId(
  state: Pick<VideoEditorState, 'project' | 'selectedTrackId'>,
  selectedClipId: string | null
): string | null {
  if (!selectedClipId) {
    return state.selectedTrackId;
  }

  return (
    state.project?.clips.find((clip) => clip.id === selectedClipId)?.trackId ??
    state.selectedTrackId
  );
}

export function resolveInitialSelectedTrackId(
  project: NonNullable<VideoEditorState['project']> | null
): string | null {
  return project?.tracks[0]?.id ?? null;
}

function createSelectSceneAction(set: VideoEditorStoreSet): VideoEditorState['selectScene'] {
  return () =>
    set((state): Partial<VideoEditorState> => ({
      placementMode: resolvePlacementModeAfterSelectionChange(
        createSceneSelection(),
        state.placementMode
      ),
      selection: createSceneSelection(),
      selectedTrackId: state.selectedTrackId ?? resolveInitialSelectedTrackId(state.project),
    }));
}

function createSelectTrackAction(set: VideoEditorStoreSet): VideoEditorState['selectTrack'] {
  return (selectedTrackId) =>
    set((state) => {
      const selection =
        selectedTrackId === null
          ? createSceneSelection()
          : {
              kind: VideoEditorSelectionKind.TRACK,
              trackId: selectedTrackId,
            };

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId,
      };
    });
}

function createSelectClipAction(set: VideoEditorStoreSet): VideoEditorState['selectClip'] {
  return (selectedClipId) =>
    set((state): Partial<VideoEditorState> => {
      const selection =
        selectedClipId === null
          ? createSceneSelection()
          : {
              kind: VideoEditorSelectionKind.CLIP,
              clipId: selectedClipId,
            };

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId: resolveSelectedTrackId(state, selectedClipId),
      };
    });
}

function createSelectTransitionAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectTransition'] {
  return (transitionId) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind: VideoEditorSelectionKind.TRANSITION_JUNCTION,
        transitionId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId:
          resolveTransitionTrackId(state.project, transitionId) ?? state.selectedTrackId,
      };
    });
}

function createSelectCursorSegmentAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectCursorSegment'] {
  return (sampleId) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind: VideoEditorSelectionKind.CURSOR_SEGMENT,
        sampleId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function createSelectObjectTrackAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectObjectTrack'] {
  return (objectTrackId) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind: VideoEditorSelectionKind.OBJECT_TRACK,
        objectTrackId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function createSelectActionOccurrenceAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectActionOccurrence'] {
  return (eventId, clipId) =>
    set((state): Partial<VideoEditorState> => {
      if (
        !state.project ||
        !resolveVideoProjectActionOccurrences(state.project).some(
          (item) => item.eventId === eventId && item.clipId === clipId
        )
      )
        return {};
      const selection = {
        kind: VideoEditorSelectionKind.ACTION_OCCURRENCE,
        eventId,
        clipId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function createSelectMotionRegionAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectMotionRegion'] {
  return (motionRegionId, part) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind:
          part === 'connection'
            ? VideoEditorSelectionKind.MOTION_CONNECTION
            : VideoEditorSelectionKind.MOTION_REGION,
        motionRegionId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function resolveTransitionTrackId(
  project: VideoEditorState['project'],
  transitionId: string
): string | null {
  const transition = (project?.transitions ?? []).find((item) => item.id === transitionId);
  if (!transition) {
    return null;
  }

  return (
    project?.clips.find((clip) => clip.id === transition.leadingClipId)?.trackId ??
    project?.clips.find((clip) => clip.id === transition.trailingClipId)?.trackId ??
    null
  );
}
