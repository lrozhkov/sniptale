import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectTrack,
} from '../../../project/types/index';

export interface VideoCompositionTimelineIndex {
  clipsByTrackId: ReadonlyMap<string, readonly VideoProjectClip[]>;
  tracksInRenderOrder: readonly VideoProjectTrack[];
}

function insertClipByStartTime(clips: VideoProjectClip[], clip: VideoProjectClip): void {
  let index = 0;
  while (index < clips.length && clips[index]!.startTime <= clip.startTime) {
    index += 1;
  }
  clips.splice(index, 0, clip);
}

function insertTrackByRenderOrder(tracks: VideoProjectTrack[], track: VideoProjectTrack): void {
  let index = 0;
  while (index < tracks.length && tracks[index]!.order >= track.order) {
    index += 1;
  }
  tracks.splice(index, 0, track);
}

export function createVideoCompositionTimelineIndex(
  project: VideoProject
): VideoCompositionTimelineIndex {
  const clipsByTrackId = new Map<string, VideoProjectClip[]>();
  const clips = Array.isArray(project.clips) ? project.clips : [];
  const tracks = Array.isArray(project.tracks) ? project.tracks : [];

  for (const clip of clips) {
    const trackClips = clipsByTrackId.get(clip.trackId);
    if (trackClips) {
      insertClipByStartTime(trackClips, clip);
    } else {
      clipsByTrackId.set(clip.trackId, [clip]);
    }
  }

  const tracksInRenderOrder: VideoProjectTrack[] = [];
  for (const track of tracks) {
    insertTrackByRenderOrder(tracksInRenderOrder, track);
  }

  return {
    clipsByTrackId,
    tracksInRenderOrder,
  };
}
