import type { VideoProject, VideoProjectClip } from '../types/index';

export function resolveAnchorPlacementClips(
  project: VideoProject,
  anchorClipIds: string[]
): {
  anchorClipIdSet: Set<string>;
  anchorClips: VideoProjectClip[];
} {
  const anchorClipIdSet = new Set(anchorClipIds);
  return {
    anchorClipIdSet,
    anchorClips: project.clips.filter((clip) => anchorClipIdSet.has(clip.id)),
  };
}
