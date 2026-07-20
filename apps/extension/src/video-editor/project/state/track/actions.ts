import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { createProjectTrackStructureActions, createProjectTrackToggleActions } from './groups';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

type VideoEditorProjectTrackActionKeys =
  | 'renameProject'
  | 'renameTrack'
  | 'updateSubtitleTrackStyle'
  | 'addTrackLogicalLane'
  | 'addTrack'
  | 'deleteTrack'
  | 'moveTrack'
  | 'toggleTrackVisibility'
  | 'toggleTrackLock'
  | 'toggleUtilityLaneVisibility'
  | 'toggleUtilityLaneLock'
  | 'clearUtilityLane';

export function createVideoEditorProjectTrackActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, VideoEditorProjectTrackActionKeys> {
  const structureActions = createProjectTrackStructureActions(set);
  const toggleActions = createProjectTrackToggleActions(set);

  return {
    ...structureActions,
    ...toggleActions,
  };
}
