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
    clips,
    ...(project.effectInstances ? { effectInstances } : {}),
    ...(project.effectSnapshots ? { effectSnapshots } : {}),
  };
}

function reconcileEffectInstances(
  project: VideoProject,
  effectHosts: VideoProjectEffectClip[]
): VideoProjectEffectInstance[] {
  const targetClipIds = new Set(
    project.clips
      .filter(
        ({ type }) => type !== VideoProjectClipType.AUDIO && type !== VideoProjectClipType.EFFECT
      )
      .map(({ id }) => id)
  );
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
    if (instance.target.kind === 'clip') {
      return targetClipIds.has(instance.target.clipId) ? [instance] : [];
    }
    if (instance.target.kind === 'scene') {
      const host = hostsByInstanceId.get(instance.id);
      return host
        ? [reconcileStandaloneInstanceTiming(instance, host.startTime, host.duration)]
        : [];
    }
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
