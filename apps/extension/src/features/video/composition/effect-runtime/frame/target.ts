import type { VideoProjectEffectInstance } from '../../../project/effect-instance/types';
import type { VideoProject, VideoProjectTransitionSegment } from '../../../project/types/index';
import type { EffectRuntimeFramePlacement } from '../runtime/types';
import { resolveEffectTargetTrackAvailability } from './target-availability';

export type UnindexedEffectRuntimeFrameTarget =
  | { clipId: string; kind: 'scene'; placement: EffectRuntimeFramePlacement }
  | { clipId: string; kind: 'clip'; placement: EffectRuntimeFramePlacement }
  | {
      kind: 'transition';
      leadingClipId: string;
      trailingClipId: string;
      transitionId: string;
    };

export function resolveEffectRuntimeFrameTarget(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  transitionSegments: readonly VideoProjectTransitionSegment[],
  projectTime: number
): UnindexedEffectRuntimeFrameTarget | null | undefined {
  const { kind, target } = instance;
  if (kind === 'standalone') {
    if (target.kind !== 'scene') return undefined;
    const host = project.clips.find(
      (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
    );
    if (!host) return undefined;
    if (projectTime < host.startTime || projectTime >= host.startTime + host.duration) return null;
    const track = project.tracks.find(({ id }) => id === host.trackId);
    return track?.visible === true
      ? { clipId: host.id, kind: 'scene', placement: resolveClipPlacement(host.transform) }
      : null;
  }
  if (kind === 'targetEffect') {
    if (target.kind !== 'clip') return undefined;
    const clip = project.clips.find(({ id }) => id === target.clipId);
    if (!clip) return undefined;
    if (projectTime < clip.startTime || projectTime >= clip.startTime + clip.duration) return null;
    const track = project.tracks.find(({ id }) => id === clip.trackId);
    return track?.visible === true
      ? { clipId: clip.id, kind: 'clip', placement: resolveClipPlacement(clip.transform) }
      : null;
  }
  if (target.kind !== 'transition') return undefined;
  const segment = transitionSegments.find(({ id }) => id === target.transitionId);
  if (!segment) return undefined;
  const availability = resolveEffectTargetTrackAvailability(project, [
    segment.leadingClipId,
    segment.trailingClipId,
  ]);
  if (availability === 'invalid') return undefined;
  if (availability === 'hidden') return null;
  return {
    kind: 'transition',
    leadingClipId: segment.leadingClipId,
    trailingClipId: segment.trailingClipId,
    transitionId: segment.id,
  };
}

function resolveClipPlacement(
  transform: VideoProject['clips'][number]['transform']
): EffectRuntimeFramePlacement {
  return {
    height: transform.height,
    opacity: Math.min(1, Math.max(0, transform.opacity)),
    rotation: transform.rotation,
    width: transform.width,
    x: transform.x,
    y: transform.y,
  };
}
