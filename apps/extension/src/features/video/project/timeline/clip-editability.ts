import type { VideoProject } from '../types';
import { getLinkedClipIds } from './basics';

export function areProjectClipsEditable(project: VideoProject, clipIds: string[]): boolean {
  return clipIds.every((clipId) => {
    const clip = project.clips.find((item) => item.id === clipId);
    if (!clip) return false;
    const track = project.tracks.find((item) => item.id === clip.trackId);
    return Boolean(track && !track.locked);
  });
}

export function canEditProjectClip(project: VideoProject, clipId: string): boolean {
  const clipIds = getLinkedClipIds(project, clipId);
  return clipIds.length > 0 && areProjectClipsEditable(project, clipIds);
}
