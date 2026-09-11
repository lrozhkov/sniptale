import { ApplyEffectInstanceError } from '../../../features/video/project/effect-instance/errors';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { resolveClipLogicalLaneId } from '../../../features/video/project/timeline';
import type { VideoProject } from '../../../features/video/project/types';
import type { VideoEditorEffectApplicationTarget } from '../../contracts/effect-document-drag';
import { moveProjectClip } from './clip-timeline/move';
import { reconcileProjectMutation } from './helpers';

/** Construct a junction and its imported graph as one later store transaction. */
export function resolveEffectApplicationTarget(
  project: VideoProject,
  target: VideoEditorEffectApplicationTarget
) {
  if (target.kind !== 'junction') return { project, target };
  const leading = project.clips.find((clip) => clip.id === target.leadingClipId);
  const trailing = project.clips.find((clip) => clip.id === target.trailingClipId);
  const track = project.tracks.find((item) => item.id === leading?.trackId);
  if (
    !track ||
    track.locked ||
    track.role === 'CAMERA' ||
    !leading ||
    !trailing ||
    leading.type === 'AUDIO' ||
    trailing.type === 'AUDIO' ||
    leading.trackId !== trailing.trackId ||
    resolveClipLogicalLaneId(leading) !== resolveClipLogicalLaneId(trailing) ||
    Math.abs(leading.startTime + leading.duration - trailing.startTime) > 0.0001
  )
    throw new ApplyEffectInstanceError('effectKindTargetMismatch');
  const duration = Math.min(0.5, leading.duration / 2, trailing.duration / 2);
  if (duration < 1 / project.fps) throw new ApplyEffectInstanceError('effectTargetMissing');
  const next = reconcileProjectMutation(
    project,
    moveProjectClip(project, trailing.id, trailing.startTime - duration)
  );
  const junction = buildProjectTransitionSegments(next).find(
    (segment) => segment.leadingClipId === leading.id && segment.trailingClipId === trailing.id
  );
  if (!junction) throw new ApplyEffectInstanceError('effectTargetOccupied');
  return { project: next, target: { kind: 'transition' as const, transitionId: junction.id } };
}
