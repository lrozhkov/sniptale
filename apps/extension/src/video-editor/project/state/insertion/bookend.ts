import { createVideoProjectSceneEdges } from '../../../../features/video/project/scene/edge-fades';
import {
  applyBookendMaterialPresentation,
  resolveBookendMaterialPresentation,
} from './bookend-presentation';
import { resolveEffectOwner } from '../../../../features/video/project/effect-instance/owner';
import { isEffectInstanceTimingEqual } from '../../../../features/video/project/effect-instance/timing';
import { prefixVideoProjectComposition } from '../../../../features/video/project/timeline/composition-prefix';
import { isHydratableVideoProject } from '../../../../features/video/project/validation/root';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import type { VideoProject } from '../../../../features/video/project/types/model';
import type { VideoEditorBookendPlacementResult } from '../../../contracts/insertion';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate } from '../helpers';
import {
  buildMaterialPlacement,
  getMaterialDuration,
  isMaterialSourceRangeValid,
} from './material-plan';
import { areMaterialInsertActionsLocked } from './material-actions';

/** Publishes an ordinary edge material and the complete composition move in one history step. */
export function createBookendPlacementAction(
  set: VideoEditorProjectSliceSet
): VideoEditorProjectState['placeBookendMaterial'] {
  return (assetId, side, expectedProject) => {
    let outcome: VideoEditorBookendPlacementResult = { status: 'rejected', reason: 'no-project' };
    set((state) => {
      const reject = (
        reason: Extract<VideoEditorBookendPlacementResult, { status: 'rejected' }>['reason']
      ) => {
        outcome = { status: 'rejected', reason };
        return state;
      };
      const project = state.project;
      if (!project) return state;
      if (project !== expectedProject) return reject('stale-project');
      if (state.projectHistory.transaction) return reject('history-busy');
      const asset = project.assets.find((item) => item.id === assetId);
      if (!asset) return reject('missing-material');
      if (asset.type === 'AUDIO') return reject('invalid-target');
      const duration = getMaterialDuration(asset);
      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        (asset.type !== 'IMAGE' && asset.metadata.duration === null)
      )
        return reject('invalid-range');
      if (side === 'intro' && isCompositionLocked(project)) return reject('locked-track');
      const preset = resolveBookendMaterialPresentation(project, side, assetId);
      const range = preset?.mode === 'video' ? preset.video.trim : undefined;
      if (range && !isMaterialSourceRangeValid(asset, range, project.fps))
        return reject('invalid-range');
      const raw = buildMaterialPlacement(
        project,
        asset,
        side === 'intro' ? 0 : project.duration,
        'append',
        range
      );
      const placement = preset ? applyBookendMaterialPresentation(project, raw, preset) : raw;
      if (!placement) return reject('invalid-project');
      const existingIds = new Set(project.clips.map((clip) => clip.id));
      const added = placement.project.clips.filter((clip) => !existingIds.has(clip.id));
      if (!placement.selectedClipId || added.length === 0) return reject('invalid-range');
      if (
        added.some(
          (clip) => placement.project.tracks.find((track) => track.id === clip.trackId)?.locked
        )
      )
        return reject('locked-track');
      const span = Math.max(...added.map((clip) => clip.duration));
      const composition =
        side === 'intro'
          ? prefixVideoProjectComposition(project, span)
          : {
              ...project,
              // A repeated material adds another source placement; old caches are already exact.
              cursorTrack: project.cursorTrack ? { ...project.cursorTrack } : null,
              ...(project.objectTracks === undefined
                ? {}
                : { objectTracks: [...project.objectTracks] }),
            };
      if (!composition) return reject('invalid-project');
      const transition = preset
        ? side === 'intro'
          ? project.bookendPresets?.introTransition
          : project.bookendPresets?.outroTransition
        : undefined;
      const edgeFade = preset?.edgeControl?.media;
      const proposed = retainOwnerEffectCoverage(project, {
        ...composition,
        ...(edgeFade
          ? {
              sceneEdges: {
                ...(project.sceneEdges ?? createVideoProjectSceneEdges()),
                [side]: {
                  ...edgeFade,
                  duration: edgeFade.enabled
                    ? Math.min(edgeFade.duration, span)
                    : edgeFade.duration,
                },
              },
            }
          : {}),
        compositionJoins: [
          ...(composition.compositionJoins ?? []),
          {
            id: crypto.randomUUID(),
            clipId: placement.selectedClipId,
            edge: side === 'intro' ? 'end' : 'start',
            ...(transition ? { transition } : {}),
          },
        ],
        tracks: placement.project.tracks,
        clips: [...composition.clips, ...added],
      });
      const update = applyProjectUpdate(state, () => proposed);
      if (!update.project || !isHydratableVideoProject(update.project))
        return reject('invalid-project');
      if (update.projectHistory?.error) return reject('history-unavailable');
      outcome = { status: 'placed', clipId: placement.selectedClipId };
      return {
        ...update,
        selection: { kind: 'clip' as const, clipId: placement.selectedClipId },
        selectedTrackId: placement.selectedTrackId,
      };
    });
    return outcome;
  };
}

function isCompositionLocked(project: VideoProject): boolean {
  return (
    project.clips.some(
      (clip) => project.tracks.find((track) => track.id === clip.trackId)?.locked
    ) ||
    (isVideoProjectUtilityLaneLocked(project, 'camera') &&
      Boolean(project.motionRegions?.length)) ||
    areMaterialInsertActionsLocked(project, 0)
  );
}

function retainOwnerEffectCoverage(previous: VideoProject, proposed: VideoProject): VideoProject {
  if (!proposed.effectInstances) return proposed;
  return {
    ...proposed,
    effectInstances: proposed.effectInstances.map((effect) => {
      if (
        effect.rangeMode !== 'owner' ||
        (effect.target.kind !== 'track' && effect.target.kind !== 'video-group')
      )
        return effect;
      const before = resolveEffectOwner(previous, effect.target);
      const after = resolveEffectOwner(proposed, effect.target);
      if (!before || !after) return effect;
      return isEffectInstanceTimingEqual(before.startTime, after.startTime) &&
        isEffectInstanceTimingEqual(before.duration, after.duration)
        ? effect
        : { ...effect, rangeMode: 'interval' };
    }),
  };
}
