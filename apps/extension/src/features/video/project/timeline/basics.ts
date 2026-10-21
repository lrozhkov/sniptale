import { reconcileVideoProjectCompositionJoins } from '../scene/joins';
import {
  VideoClipLinkMode,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectAudioClip,
  VideoProjectDurationMode,
  isVideoProjectDurationMode,
  VideoProjectClipType,
  type VideoProjectTrack,
} from '../types/index';
import { applyVideoProjectMutationPatch } from '../mutation';
import { syncProjectTransitions } from '../transition/project';
import { reconcileVideoProjectEffectInstances } from '../effect-instance/reconcile';
export { getClipGainRange, getClipWaveformPeaks } from './audio';
export {
  clampClipPlaybackRate,
  getMediaClipSourceTime,
  getSourceTimedClipProjectDuration,
  getSourceTimedClipProjectOffset,
  getSourceTimedClipSourceOffset,
  getVideoClipSourceTime,
  normalizeClipPlaybackRate,
} from './rate';

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getSortedTracks(project: VideoProject): VideoProjectTrack[] {
  return [...project.tracks].sort((left, right) => left.order - right.order);
}

export function getTrackById(
  project: VideoProject,
  trackId: string
): VideoProjectTrack | undefined {
  return project.tracks.find((track) => track.id === trackId);
}

export function getClipById(project: VideoProject, clipId: string): VideoProjectClip | undefined {
  return project.clips.find((clip) => clip.id === clipId);
}

export function getAssetById(project: VideoProject, assetId: string) {
  return project.assets.find((asset) => asset.id === assetId);
}

export function getClipEndTime(clip: VideoProjectClip): number {
  return clip.startTime + clip.duration;
}

export function calculateProjectDuration(project: VideoProject): number {
  let duration = project.clips.reduce(
    (maxEnd, clip) =>
      clip.type === VideoProjectClipType.AUDIO &&
      clip.durationMode === VideoProjectDurationMode.PROJECT
        ? maxEnd
        : Math.max(maxEnd, getClipEndTime(clip)),
    0
  );
  for (const entry of project.textDocuments ?? []) {
    if (entry.binding.kind !== 'project' || entry.durationMode === 'project') continue;
    for (const fragment of entry.document.fragments) duration = Math.max(duration, fragment.end);
  }
  return duration;
}

export function syncProjectDuration(project: VideoProject): VideoProject {
  const nextProject = reconcileVideoProjectEffectInstances(
    syncProjectTransitions(reconcileVideoProjectCompositionJoins(project))
  );

  return applyVideoProjectMutationPatch(nextProject, {
    duration: calculateProjectDuration(nextProject),
  });
}

export function getTrackClips(project: VideoProject, trackId: string): VideoProjectClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((left, right) => left.startTime - right.startTime);
}

export function isMediaClip(clip: VideoProjectClip): clip is Extract<
  VideoProjectClip,
  {
    type:
      | typeof VideoProjectClipType.VIDEO
      | typeof VideoProjectClipType.AUDIO
      | typeof VideoProjectClipType.IMAGE;
  }
> {
  return (
    clip.type === VideoProjectClipType.VIDEO ||
    clip.type === VideoProjectClipType.AUDIO ||
    clip.type === VideoProjectClipType.IMAGE
  );
}

export function isVideoClip(
  clip: VideoProjectClip
): clip is Extract<VideoProjectClip, { type: typeof VideoProjectClipType.VIDEO }> {
  return clip.type === VideoProjectClipType.VIDEO;
}

export function isAudioClip(
  clip: VideoProjectClip
): clip is Extract<VideoProjectClip, { type: typeof VideoProjectClipType.AUDIO }> {
  return clip.type === VideoProjectClipType.AUDIO;
}

export function isClipActiveAtTime(clip: VideoProjectClip, currentTime: number): boolean {
  return currentTime >= clip.startTime && currentTime < getClipEndTime(clip);
}

export function getLinkedClipIds(project: VideoProject, clipId: string): string[] {
  const clip = getClipById(project, clipId);
  if (!clip) {
    return [];
  }
  if (!clip.groupId || clip.linkMode !== VideoClipLinkMode.LINKED) {
    return [clip.id];
  }

  const linkedClips = project.clips.filter(
    (item) => item.groupId === clip.groupId && item.linkMode === VideoClipLinkMode.LINKED
  );
  return linkedClips.length > 0 ? linkedClips.map((item) => item.id) : [clip.id];
}

/** Changes only the current, unlocked take; retained samples and fades remain intact. */
export function updateProjectAudioDurationMode(
  project: VideoProject,
  basis: VideoProjectAudioClip,
  durationMode: unknown
): VideoProject {
  if (
    !isVideoProjectDurationMode(durationMode) ||
    !project.clips.includes(basis) ||
    !project.tracks.some((track) => track.id === basis.trackId && !track.locked) ||
    durationMode === (basis.durationMode ?? VideoProjectDurationMode.CONTENT)
  )
    return project;
  return syncProjectDuration(
    applyVideoProjectMutationPatch(project, {
      clips: project.clips.map((clip) => (clip === basis ? { ...basis, durationMode } : clip)),
    })
  );
}
