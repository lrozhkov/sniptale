import {
  createClipGroupId,
  createVideoProjectTrack,
  getDefaultTrackName,
} from '../../../../features/video/project/factories/creation';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../../features/video/project/factories/clip';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectAsset,
} from '../../../../features/video/project/types';
import type { AddAssetClipResult } from '../asset-shared';

/** Resolves material destinations without ambient selection or occupied-lane relocation. */
export function buildMaterialPlacement(
  project: VideoProject,
  asset: VideoProjectAsset,
  time: number,
  mode: 'append' | 'overlay'
): AddAssetClipResult {
  const audioOnly = asset.type === VideoProjectAssetType.AUDIO;
  const tracks = [...project.tracks];
  const resolveTrack = (kind: VideoTrackKind) => {
    if (mode === 'append') {
      const existing =
        tracks.find((item) => item.kind === kind && item.isRoot) ??
        tracks.find((item) => item.kind === kind);
      if (existing) return existing;
    }
    const track = createVideoProjectTrack(
      getDefaultTrackName(kind, tracks.filter((item) => item.kind === kind).length + 1),
      kind === VideoTrackKind.AUDIO
        ? Math.max(0, ...tracks.map(({ order }) => order)) + 1
        : Math.min(0, ...tracks.map(({ order }) => order)) - 1,
      kind
    );
    tracks.push(track);
    return track;
  };
  const track = resolveTrack(audioOnly ? VideoTrackKind.AUDIO : VideoTrackKind.PRIMARY);
  const withAudio =
    !audioOnly && asset.type !== VideoProjectAssetType.IMAGE && asset.metadata.hasAudio;
  const groupId = withAudio ? createClipGroupId() : null;
  const clip = audioOnly
    ? createAudioClipFromAsset(track.id, asset, time)
    : createVideoClipFromAsset(track.id, asset, project.width, project.height, time, {
        groupId,
        muted: withAudio,
      });
  const clips = [...project.clips, clip];
  if (withAudio) {
    const audio = resolveTrack(VideoTrackKind.AUDIO);
    clips.push(createAudioClipFromAsset(audio.id, asset, time, { groupId }));
  }
  return {
    project: applyVideoProjectMutationPatch(project, { clips, tracks }),
    selectedClipId: clip.id,
    selectedTrackId: track.id,
  };
}
