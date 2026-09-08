import { resolveVideoProjectActionOccurrences } from '../../features/video/project/action-occurrences';
import type { StateCreator } from 'zustand';
import { isVideoProjectUtilityLaneLocked } from '../../features/video/project/utility-lanes';
import {
  createActionPointPlacementMode,
  createMotionAreaPlacementMode,
  createMotionFocusPlacementMode,
} from '../project/selection/placement';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createPlacementStateActions(set: VideoEditorStoreSet) {
  return {
    startActionPointPlacement: (eventId: string, clipId: string | null) =>
      set((state) =>
        !state.project ||
        isVideoProjectUtilityLaneLocked(state.project, 'actions') ||
        !resolveVideoProjectActionOccurrences(state.project).some(
          (item) => item.eventId === eventId && item.clipId === clipId
        )
          ? {}
          : { placementMode: createActionPointPlacementMode(eventId, clipId) }
      ),
    startMotionFocusPlacement: (motionRegionId: string) =>
      set((state) =>
        createCameraPlacementPatch(state, createMotionFocusPlacementMode(motionRegionId))
      ),
    startMotionAreaPlacement: (motionRegionId: string) =>
      set((state) =>
        createCameraPlacementPatch(state, createMotionAreaPlacementMode(motionRegionId))
      ),
  };
}

function createCameraPlacementPatch(
  state: VideoEditorState,
  placementMode: VideoEditorState['placementMode']
): Partial<VideoEditorState> {
  return state.project && isVideoProjectUtilityLaneLocked(state.project, 'camera')
    ? {}
    : { placementMode };
}
