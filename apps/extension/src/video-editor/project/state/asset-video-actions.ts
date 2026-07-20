import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../features/video/project/factories/clip';
import { createClipGroupId } from '../../../features/video/project/factories/creation';
import type {
  VideoProject,
  VideoProjectAsset,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types/index';
import { VideoTrackKind } from '../../../features/video/project/types/index';
import {
  assignClipTimelineLane,
  buildInsertedClipResult,
  type AddAssetClipResult,
} from './asset-shared';
import { ensureTrackForKind } from './helpers';

function buildGroupedVideoAssetClips(
  project: VideoProject,
  asset: VideoProjectAsset,
  trackId: string,
  insertionTime: number,
  timelineLaneId?: string | null
): {
  audioTrackProject: VideoProject;
  audioClip: VideoProjectAudioClip;
  videoClip: VideoProjectVideoClip;
} {
  const audioTrack = ensureTrackForKind(project, VideoTrackKind.AUDIO, null);
  const groupId = createClipGroupId();
  const videoClip = assignClipTimelineLane(
    createVideoClipFromAsset(trackId, asset, project.width, project.height, insertionTime, {
      groupId,
      muted: true,
    }) as VideoProjectVideoClip,
    timelineLaneId
  ) as VideoProjectVideoClip;
  const audioClip = assignClipTimelineLane(
    createAudioClipFromAsset(audioTrack.trackId, asset, insertionTime, {
      groupId,
      muted: false,
    }) as VideoProjectAudioClip,
    timelineLaneId
  ) as VideoProjectAudioClip;

  return {
    audioTrackProject: audioTrack.project,
    audioClip,
    videoClip,
  };
}

function buildUngroupedVideoAssetClip(
  project: VideoProject,
  asset: VideoProjectAsset,
  trackId: string,
  insertionTime: number,
  timelineLaneId?: string | null
): VideoProjectVideoClip {
  return assignClipTimelineLane(
    createVideoClipFromAsset(
      trackId,
      asset,
      project.width,
      project.height,
      insertionTime
    ) as VideoProjectVideoClip,
    timelineLaneId
  );
}

function buildGroupedVideoAssetResult(
  grouped: {
    audioTrackProject: VideoProject;
    audioClip: VideoProjectAudioClip;
    videoClip: VideoProjectVideoClip;
  },
  asset: VideoProjectAsset
): AddAssetClipResult {
  return buildInsertedClipResult({
    asset,
    clips: [grouped.videoClip, grouped.audioClip],
    project: grouped.audioTrackProject,
    selectedClipId: grouped.videoClip.id,
    selectedTrackId: grouped.videoClip.trackId,
  });
}

function buildUngroupedVideoAssetResult(
  project: VideoProject,
  asset: VideoProjectAsset,
  clip: VideoProjectVideoClip
): AddAssetClipResult {
  return buildInsertedClipResult({
    asset,
    clips: [clip],
    project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

export function addVideoAssetClip(
  project: VideoProject,
  asset: VideoProjectAsset,
  preferredTrackId: string | null,
  insertionTime: number,
  timelineLaneId?: string | null
): AddAssetClipResult {
  const primaryTrack = ensureTrackForKind(project, VideoTrackKind.PRIMARY, preferredTrackId);

  if (asset.metadata.hasAudio) {
    const grouped = buildGroupedVideoAssetClips(
      primaryTrack.project,
      asset,
      primaryTrack.trackId,
      insertionTime,
      timelineLaneId
    );

    return buildGroupedVideoAssetResult(grouped, asset);
  }

  const clip = buildUngroupedVideoAssetClip(
    primaryTrack.project,
    asset,
    primaryTrack.trackId,
    insertionTime,
    timelineLaneId
  );

  return buildUngroupedVideoAssetResult(primaryTrack.project, asset, clip);
}
