import { resolveEffectOwner } from './owner';
import { buildProjectTransitionSegments } from '../transition/project';
import { VideoProjectClipType, type VideoProject, type VideoProjectEffectClip } from '../types';
import { isEffectInstanceTimingEqual } from './timing';
import type { VideoProjectEffectInstance } from './types';

/**
 * Reconciles EffectV1 references after a project geometry mutation.
 *
 * Clip-target effects remain attached to their clip and are clipped by the shared
 * render/audio plans. Transition effects, whose timing is defined by the junction,
 * follow the rebuilt transition segment exactly. Missing targets and snapshots that
 * are no longer referenced are removed in the same project mutation wave.
 */
export function reconcileVideoProjectEffectInstances(project: VideoProject): VideoProject {
  const effectHosts = project.clips.filter(
    (clip): clip is VideoProjectEffectClip => clip.type === VideoProjectClipType.EFFECT
  );
  if (!project.effectInstances && !project.effectSnapshots && effectHosts.length === 0) {
    return project;
  }
  const effectInstances = reconcileEffectInstances(project, effectHosts);
  const usedSnapshotIds = new Set(effectInstances.map(({ snapshotId }) => snapshotId));
  const clips = retainEffectHostClips(project, effectInstances);
  const effectSnapshots = (project.effectSnapshots ?? []).filter(({ id }) =>
    usedSnapshotIds.has(id)
  );
  return {
    ...project,
    clips: clips.length === project.clips.length ? project.clips : clips,
    ...(project.effectInstances
      ? {
          effectInstances:
            effectInstances.length === project.effectInstances.length &&
            effectInstances.every(
              (instance, index) => instance === project.effectInstances?.[index]
            )
              ? project.effectInstances
              : effectInstances,
        }
      : {}),
    ...(project.effectSnapshots
      ? {
          effectSnapshots:
            effectSnapshots.length === project.effectSnapshots.length
              ? project.effectSnapshots
              : effectSnapshots,
        }
      : {}),
  };
}

function reconcileEffectInstances(
  project: VideoProject,
  effectHosts: VideoProjectEffectClip[]
): VideoProjectEffectInstance[] {
  const hostsByInstanceId = new Map<string, (typeof effectHosts)[number]>();
  for (const host of effectHosts) {
    if (!hostsByInstanceId.has(host.effectInstanceId)) {
      hostsByInstanceId.set(host.effectInstanceId, host);
    }
  }
  const transitionSegments = new Map(
    buildProjectTransitionSegments(project).map((segment) => [segment.id, segment])
  );
  return (project.effectInstances ?? []).flatMap((instance) => {
    if (instance.kind === 'targetEffect') {
      const clip = resolveEffectOwner(project, instance.target);
      if (!clip || clip.duration <= 0) return [];
      if (instance.rangeMode === 'owner')
        return [reconcileStandaloneInstanceTiming(instance, clip.startTime, clip.duration)];
      const startTime = Math.max(instance.startTime, clip.startTime);
      const end = Math.min(instance.startTime + instance.duration, clip.startTime + clip.duration);
      if (end <= startTime) return [];
      const duration = end - startTime;
      const sourceStart =
        (instance.sourceStart ?? 0) + (startTime - instance.startTime) * instance.playbackRate;
      return [
        instance.startTime === startTime &&
        instance.duration === duration &&
        instance.sourceStart === sourceStart
          ? instance
          : { ...instance, startTime, duration, sourceStart },
      ];
    }
    if (instance.target.kind === 'scene') {
      const host = hostsByInstanceId.get(instance.id);
      if (!host) return [];
      if (host.playbackWindow)
        return [
          instance.startTime === host.startTime
            ? instance
            : { ...instance, startTime: host.startTime },
        ];
      return [reconcileStandaloneInstanceTiming(instance, host.startTime, host.duration)];
    }
    if (instance.target.kind !== 'transition') return [];
    const segment = transitionSegments.get(instance.target.transitionId);
    if (!segment) return [];
    return [reconcileTransitionInstanceTiming(instance, segment.start, segment.end)];
  });
}

function retainEffectHostClips(
  project: VideoProject,
  effectInstances: VideoProjectEffectInstance[]
): VideoProject['clips'] {
  const standaloneInstanceIds = new Set(
    effectInstances
      .filter(({ kind, target }) => kind === 'standalone' && target.kind === 'scene')
      .map(({ id }) => id)
  );
  const retainedHostInstanceIds = new Set<string>();
  return project.clips.filter((clip) => {
    if (clip.type !== VideoProjectClipType.EFFECT) return true;
    if (
      !standaloneInstanceIds.has(clip.effectInstanceId) ||
      retainedHostInstanceIds.has(clip.effectInstanceId)
    ) {
      return false;
    }
    retainedHostInstanceIds.add(clip.effectInstanceId);
    return true;
  });
}

function reconcileStandaloneInstanceTiming(
  instance: VideoProjectEffectInstance,
  startTime: number,
  duration: number
): VideoProjectEffectInstance {
  if (duration <= 0) return instance;
  const documentDuration = instance.duration * instance.playbackRate;
  const playbackRate = documentDuration / duration;
  if (
    isEffectInstanceTimingEqual(instance.startTime, startTime) &&
    isEffectInstanceTimingEqual(instance.duration, duration) &&
    isEffectInstanceTimingEqual(instance.playbackRate, playbackRate)
  ) {
    return instance;
  }
  return { ...instance, duration, playbackRate, startTime };
}

function reconcileTransitionInstanceTiming(
  instance: VideoProjectEffectInstance,
  segmentStart: number,
  segmentEnd: number
): VideoProjectEffectInstance {
  const duration = segmentEnd - segmentStart;
  if (duration <= 0) return instance;
  const documentDuration = instance.duration * instance.playbackRate;
  const playbackRate = documentDuration / duration;
  if (
    isEffectInstanceTimingEqual(instance.startTime, segmentStart) &&
    isEffectInstanceTimingEqual(instance.duration, duration) &&
    isEffectInstanceTimingEqual(instance.playbackRate, playbackRate)
  ) {
    return instance;
  }
  return { ...instance, duration, playbackRate, startTime: segmentStart };
}
