import { resolveEffectOwner } from './owner';
import type { VideoProject } from '../types';
import type { VideoProjectEffectInstance } from './types';

export function isEffectInstanceEditable(
  project: VideoProject,
  instance: VideoProjectEffectInstance
): boolean {
  const target = instance.target;
  if (instance.kind === 'targetEffect') {
    const owner = resolveEffectOwner(project, target);
    return owner !== null && !owner.locked;
  }
  const clips = project.clips.filter((clip) =>
    target.kind === 'clip'
      ? clip.id === target.clipId
      : target.kind === 'scene'
        ? clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
        : target.kind === 'transition' &&
          project.transitions?.some(
            (junction) =>
              junction.id === target.transitionId &&
              (junction.leadingClipId === clip.id || junction.trailingClipId === clip.id)
          )
  );
  return (
    clips.length > 0 &&
    clips.every((clip) => {
      const track = project.tracks.find((track) => track.id === clip.trackId);
      return track && !track.locked;
    })
  );
}

/** Retime the retained graph span, never freeze its last frame or restart a trimmed entrance. */
export function resizeClipEffectInterval(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  patch: { startTime?: number; duration?: number; rangeMode?: 'owner' | 'interval' }
): VideoProjectEffectInstance {
  const target = instance.target;
  if (instance.kind !== 'targetEffect') return instance;
  const clip = resolveEffectOwner(project, target);
  if (!clip || !isEffectInstanceEditable(project, instance)) return instance;
  if (
    (patch.startTime !== undefined && !Number.isFinite(patch.startTime)) ||
    (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration <= 0))
  )
    return instance;
  const owner = patch.rangeMode === 'owner';
  const duration = owner
    ? clip.duration
    : Math.min(patch.duration ?? instance.duration, clip.duration);
  if (duration <= 0) return instance;
  const startTime = owner
    ? clip.startTime
    : Math.max(
        clip.startTime,
        Math.min(patch.startTime ?? instance.startTime, clip.startTime + clip.duration - duration)
      );
  return {
    ...instance,
    startTime,
    duration,
    rangeMode: owner ? 'owner' : 'interval',
    playbackRate: (instance.duration * instance.playbackRate) / duration,
  };
}
