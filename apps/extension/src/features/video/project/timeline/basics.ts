import {
  VideoClipLinkMode,
  type VideoProject,
  type VideoProjectClip,
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
  if (project.clips.length === 0) {
    return 0;
  }

  return project.clips.reduce((maxEnd, clip) => Math.max(maxEnd, getClipEndTime(clip)), 0);
}

export function syncProjectDuration(project: VideoProject): VideoProject {
  const nextProject = reconcileVideoProjectEffectInstances(syncProjectTransitions(project));

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
