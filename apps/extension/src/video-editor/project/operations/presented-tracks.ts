import {
  VideoTrackKind,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectTrack,
} from '../../../features/video/project/types';

/** Keeps legacy subtitle data persisted while excluding its retired editor capability. */
export function isVideoEditorPresentedTrack(track: VideoProjectTrack): boolean {
  return track.kind !== VideoTrackKind.SUBTITLE;
}

export function isVideoEditorPresentedClip(
  project: Pick<VideoProject, 'tracks'>,
  clip: Pick<VideoProjectClip, 'trackId'>
): boolean {
  const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
  return track !== undefined && isVideoEditorPresentedTrack(track);
}
