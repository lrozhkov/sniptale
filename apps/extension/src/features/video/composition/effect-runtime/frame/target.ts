import { isClipActiveAtTime } from '../../../project/timeline/basics';
import { resolveEffectSourceClip } from '../../../project/effect-instance/placement';
import type { VideoProjectEffectInstance } from '../../../project/effect-instance/types';
import { isEffectHostTimingValid } from '../../../project/effect-instance/timing';
import type { VideoProject, VideoProjectEffectClip } from '../../../project/types/index';
import type { EffectRuntimeFramePlacement } from '../runtime/types';

type UnindexedEffectRuntimeFrameTarget =
  | { kind: 'track'; trackId: string; clipIds: string[] }
  | { kind: 'video-group'; clipIds: string[] }
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
  projectTime: number
): UnindexedEffectRuntimeFrameTarget | null | undefined {
  const { kind, target } = instance;
  if (kind === 'standalone') {
    if (target.kind !== 'scene') return undefined;
    const host = project.clips.find(
      (clip): clip is VideoProjectEffectClip =>
        clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
    );
    if (!host || !isEffectHostTimingValid(host, instance)) return undefined;
    if (!isClipActiveAtTime(host, projectTime)) return null;
    if (host.attachment?.kind === 'source' && !resolveEffectSourceClip(project, host, projectTime))
      return null;
    const track = project.tracks.find(({ id }) => id === host.trackId);
    return track?.visible === true
      ? { clipId: host.id, kind: 'scene', placement: resolveClipPlacement(host.transform) }
      : null;
  }
  return undefined;
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
