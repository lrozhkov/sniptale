import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { VideoEditorMaterialPlacementResult } from '../../../contracts/insertion';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate } from '../helpers';
import { buildMaterialPlacement } from './material-plan';
import { makeRoomForMaterial } from './material-insert';
import { reconcileRecordingInteractionAnchors } from '../../operations/source-timed-clips';
import { areMaterialInsertActionsLocked, insertMaterialActionGap } from './material-actions';
import { insertMaterialCursorGap } from './material-cursor';

/** Places an existing source with one admitted project and selection transition. */
export function createMaterialPlacementAction(
  set: VideoEditorProjectSliceSet,
  mode: 'append' | 'overlay' | 'insert'
): VideoEditorProjectState['appendMaterial'] {
  return (assetId) => {
    let outcome: VideoEditorMaterialPlacementResult = { status: 'rejected', reason: 'no-project' };
    set((state) => {
      const project = state.project;
      if (!project) return state;
      const asset = project.assets.find(({ id }) => id === assetId);
      if (!asset) {
        outcome = { status: 'rejected', reason: 'missing-material' };
        return state;
      }
      const end = project.clips.reduce(
        (time, clip) => Math.max(time, clip.startTime + clip.duration),
        0
      );
      const result = buildMaterialPlacement(
        project,
        asset,
        mode === 'append' ? end : state.currentTime,
        mode === 'overlay' ? 'overlay' : 'append'
      );
      const existingIds = new Set(project.clips.map(({ id }) => id));
      const addedClips = result.project.clips.filter(({ id }) => !existingIds.has(id));
      if (
        addedClips.some(
          (clip) => result.project.tracks.find(({ id }) => id === clip.trackId)?.locked
        )
      ) {
        outcome = { status: 'rejected', reason: 'locked-track' };
        return state;
      }
      if (!result.selectedClipId) {
        outcome = { status: 'rejected', reason: 'missing-material' };
        return state;
      }
      if (mode === 'insert') {
        if (areMaterialInsertActionsLocked(project, state.currentTime)) {
          outcome = { status: 'rejected', reason: 'locked-track' };
          return state;
        }
        const duration = Math.max(...addedClips.map((clip) => clip.duration));
        const room = makeRoomForMaterial(project, state.currentTime, duration);
        if (room.status === 'rejected') {
          outcome = room;
          return state;
        }
        result.project = {
          // Resolve old-source lineage before a repeated material can become an anchor candidate.
          ...insertMaterialActionGap(
            reconcileRecordingInteractionAnchors(
              project,
              room.project,
              room.trailingClipIdsBySourceId
            ),
            state.currentTime,
            duration,
            room.trailingClipIdsBySourceId
          ),
          tracks: result.project.tracks,
          clips: [...room.project.clips, ...addedClips],
        };
        result.project = insertMaterialCursorGap(
          project,
          result.project,
          state.currentTime,
          duration,
          room.trailingClipIdsBySourceId
        );
      }
      outcome = { status: 'placed', clipId: result.selectedClipId };
      return {
        ...applyProjectUpdate(state, () => result.project),
        selection: { kind: VideoEditorSelectionKind.CLIP, clipId: result.selectedClipId },
        selectedTrackId: result.selectedTrackId,
      };
    });
    return outcome;
  };
}
