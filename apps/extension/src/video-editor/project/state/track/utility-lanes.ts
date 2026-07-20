import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  getVideoProjectUtilityLanes,
  type VideoProjectUtilityLaneKind,
} from '../../../../features/video/project/utility-lanes';
import type { VideoProject } from '../../../../features/video/project/types/index';
import { createSceneSelection } from '../../selection/model';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate } from '../helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

type UtilityLanePatch = Partial<ReturnType<typeof getVideoProjectUtilityLanes>['actions']>;

function updateUtilityLane(
  project: VideoProject,
  lane: VideoProjectUtilityLaneKind,
  patch: UtilityLanePatch
): VideoProject {
  const utilityLanes = getVideoProjectUtilityLanes(project);
  return applyVideoProjectMutationPatch(project, {
    utilityLanes: {
      ...utilityLanes,
      [lane]: { ...utilityLanes[lane], ...patch },
    },
  });
}

export function createUtilityLaneVisibilityToggle(set: VideoEditorStoreSet) {
  return (lane: VideoProjectUtilityLaneKind) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const utilityLanes = getVideoProjectUtilityLanes(project);
        return updateUtilityLane(project, lane, { visible: !utilityLanes[lane].visible });
      })
    );
}

export function createUtilityLaneLockToggle(set: VideoEditorStoreSet) {
  return (lane: VideoProjectUtilityLaneKind) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const utilityLanes = getVideoProjectUtilityLanes(project);
        return updateUtilityLane(project, lane, { locked: !utilityLanes[lane].locked });
      })
    );
}

export function createUtilityLaneClearAction(set: VideoEditorStoreSet) {
  return (lane: VideoProjectUtilityLaneKind) => set((state) => clearUtilityLaneState(state, lane));
}

function clearUtilityLaneState(
  state: VideoEditorProjectState,
  lane: VideoProjectUtilityLaneKind
): Partial<VideoEditorProjectState> {
  const utilityLanes = state.project ? getVideoProjectUtilityLanes(state.project) : null;
  if (!state.project || utilityLanes?.[lane].locked) {
    return {};
  }

  const nextState = applyProjectUpdate(state, (project) =>
    applyVideoProjectMutationPatch(project, getUtilityLaneClearPatch(lane))
  );

  return clearRemovedUtilityLaneSelection(nextState, lane);
}

function getUtilityLaneClearPatch(
  lane: VideoProjectUtilityLaneKind
): Pick<VideoProject, 'actionEvents'> | Pick<VideoProject, 'motionRegions'> {
  return lane === 'actions' ? { actionEvents: [] } : { motionRegions: [] };
}

function clearRemovedUtilityLaneSelection(
  state: Partial<VideoEditorProjectState>,
  lane: VideoProjectUtilityLaneKind
): Partial<VideoEditorProjectState> {
  if (lane === 'actions' && state.selection?.kind === VideoEditorSelectionKind.ACTION_SEGMENT) {
    return { ...state, placementMode: null, selection: createSceneSelection() };
  }

  if (lane === 'camera' && state.selection?.kind === VideoEditorSelectionKind.MOTION_REGION) {
    return { ...state, placementMode: null, selection: createSceneSelection() };
  }

  return state;
}
