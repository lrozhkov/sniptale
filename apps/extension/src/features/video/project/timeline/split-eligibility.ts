import type { VideoProject } from '../types';
import { getLinkedClipIds } from './basics';

export const MINIMUM_CLIP_SPLIT_EDGE_SECONDS = 0.05;

export function canSplitProjectClipAtTime(
  project: VideoProject,
  clipId: string,
  splitTime: number
): boolean {
  const clipIds = getLinkedClipIds(project, clipId);
  if (clipIds.length === 0) return false;

  return clipIds.every((affectedClipId) => {
    const clip = project.clips.find((item) => item.id === affectedClipId);
    if (!clip) return false;
    const track = project.tracks.find((item) => item.id === clip.trackId);
    if (!track || track.locked) return false;

    const startOffset = splitTime - clip.startTime;
    const endOffset = clip.duration - startOffset;
    const tolerance =
      Number.EPSILON *
      16 *
      Math.max(1, Math.abs(splitTime), Math.abs(clip.startTime), Math.abs(clip.duration));
    return (
      startOffset > MINIMUM_CLIP_SPLIT_EDGE_SECONDS + tolerance &&
      endOffset > MINIMUM_CLIP_SPLIT_EDGE_SECONDS + tolerance
    );
  });
}
