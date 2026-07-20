import { getSubtitleTrackStyle } from '../text/subtitle-track';
import { getVideoProjectTrackLogicalLaneIds } from '../timeline/logical-lanes';
import type { VideoProject } from '../types/index';

export function normalizeHydratedTracks(
  project: VideoProject,
  clips: VideoProject['clips'],
  legacyTrackNames: ReadonlyMap<string, string>
): VideoProject['tracks'] {
  const projectWithNormalizedClips = { ...project, clips };
  return project.tracks.map((track, index) => ({
    ...track,
    logicalLanes: getVideoProjectTrackLogicalLaneIds(projectWithNormalizedClips, track.id).map(
      (id) => ({ id })
    ),
    order: track.order ?? index,
    name: legacyTrackNames.get(track.name) ?? track.name,
    ...(track.kind === 'SUBTITLE' ? { subtitleStyle: getSubtitleTrackStyle(track) } : {}),
  }));
}
