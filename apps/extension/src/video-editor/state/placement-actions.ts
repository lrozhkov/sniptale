import type { StateCreator } from 'zustand';
import { isVideoProjectUtilityLaneLocked } from '../../features/video/project/utility-lanes';
import {
  createActionPointPlacementMode,
  createMotionAreaPlacementMode,
  createMotionFocusPlacementMode,
  createMotionPathStopAreaPlacementMode,
  createMotionPathStopPointPlacementMode,
} from '../project/selection/placement';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createPlacementStateActions(set: VideoEditorStoreSet) {
  return {
    startActionPointPlacement: (actionEventId: string) =>
      set((state) =>
        state.project && isVideoProjectUtilityLaneLocked(state.project, 'actions')
          ? {}
          : { placementMode: createActionPointPlacementMode(actionEventId) }
      ),
    startMotionFocusPlacement: (motionRegionId: string) =>
      set((state) =>
        createCameraPlacementPatch(state, createMotionFocusPlacementMode(motionRegionId))
      ),
    startMotionAreaPlacement: (motionRegionId: string) =>
      set((state) =>
        createCameraPlacementPatch(state, createMotionAreaPlacementMode(motionRegionId))
      ),
    startMotionPathStopAreaPlacement: (motionRegionId: string, stopId: string) =>
      set((state) =>
        createCameraPlacementPatch(
          state,
          createMotionPathStopAreaPlacementMode(motionRegionId, stopId)
        )
      ),
    startMotionPathStopPointPlacement: (motionRegionId: string, stopId: string) =>
      set((state) =>
        createCameraPlacementPatch(
          state,
          createMotionPathStopPointPlacementMode(motionRegionId, stopId)
        )
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
