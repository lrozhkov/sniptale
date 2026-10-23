import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types';

/** AUDIO masters affect media on that track without changing authored clip gain. */
export function getProjectTrackAudioVolume(project: VideoProject, trackId: string): number {
  const track = project.tracks.find((track) => track.id === trackId);
  return track?.kind === 'AUDIO' ? (track.audioVolume ?? 1) : 1;
}

/** Uses the canonical project mutation owner for an exact unlocked AUDIO track. */
export function updateProjectTrackAudioVolume(
  project: VideoProject,
  trackId: string,
  volume: number
) {
  const track = project.tracks.find((track) => track.id === trackId);
  if (
    track?.kind !== 'AUDIO' ||
    track.locked ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 2 ||
    (track.audioVolume ?? 1) === volume
  )
    return project;
  return applyVideoProjectMutationPatch(project, {
    tracks: project.tracks.map((item) =>
      item === track ? { ...track, audioVolume: volume } : item
    ),
  });
}
