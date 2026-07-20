import type { StateCreator } from 'zustand';
import { clampNumber } from '../../features/video/project/hydration';
import { resolvePlacementModeAfterSelectionChange } from '../project/selection/placement';
import { createSceneSelection } from '../project/selection/model';
import { VideoEditorSelectionKind } from '../contracts/selection';
import { createPlacementStateActions } from './placement-actions';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createSelectionStateActions(set: VideoEditorStoreSet) {
  return {
    clearPlacementMode: () => set({ placementMode: null }),
    setCurrentTime: (time: number) =>
      set(
        (state): Partial<VideoEditorState> => ({
          currentTime: clampNumber(time, 0, Math.max(0, state.project?.duration ?? 0)),
        })
      ),
    setPlaying: (isPlaying: boolean) => set({ isPlaying }),
    togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
    setPixelsPerSecond: (pixelsPerSecond: number) =>
      set({ pixelsPerSecond: clampNumber(pixelsPerSecond, 12, 320) }),
    selectScene: createSelectSceneAction(set),
    selectTrack: createSelectTrackAction(set),
    selectClip: createSelectClipAction(set),
    selectTransition: createSelectTransitionAction(set),
    selectCursorSegment: createSelectCursorSegmentAction(set),
    selectObjectTrack: createSelectObjectTrackAction(set),
    selectActionSegment: createSelectActionSegmentAction(set),
    selectMotionRegion: createSelectMotionRegionAction(set),
    ...createPlacementStateActions(set),
    setDiagnosticsOpen: (diagnosticsOpen: boolean) => set({ diagnosticsOpen }),
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
    set(
      (state): Partial<VideoEditorState> => ({
        placementMode: resolvePlacementModeAfterSelectionChange(
          createSceneSelection(),
          state.placementMode
        ),
        selection: createSceneSelection(),
        selectedClipId: null,
        selectedTrackId: state.selectedTrackId ?? resolveInitialSelectedTrackId(state.project),
      })
    );
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
        selectedClipId: null,
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
        selectedClipId,
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
        selectedClipId: null,
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
        selectedClipId: null,
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
        selectedClipId: null,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function createSelectActionSegmentAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectActionSegment'] {
  return (actionEventId) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind: VideoEditorSelectionKind.ACTION_SEGMENT,
        actionEventId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedClipId: null,
        selectedTrackId: state.selectedTrackId,
      };
    });
}

function createSelectMotionRegionAction(
  set: VideoEditorStoreSet
): VideoEditorState['selectMotionRegion'] {
  return (motionRegionId) =>
    set((state): Partial<VideoEditorState> => {
      const selection = {
        kind: VideoEditorSelectionKind.MOTION_REGION,
        motionRegionId,
      } as const;

      return {
        placementMode: resolvePlacementModeAfterSelectionChange(selection, state.placementMode),
        selection,
        selectedClipId: null,
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
