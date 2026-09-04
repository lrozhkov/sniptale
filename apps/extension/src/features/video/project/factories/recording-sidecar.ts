import { createVideoClipFromAsset, createVideoProjectTransform } from './clip';
import { createRecordingProjectAsset } from './recording';
import {
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoProjectTrackRole,
  type VideoProjectAsset,
  type VideoProjectClip,
  type VideoProjectTrackRole as VideoProjectTrackRoleValue,
} from '../types/index';
import {
  resolveVideoProjectCameraPlacement,
  VideoProjectCameraPlacement,
} from '../camera/placement';

export type RecordingSidecarVideoProjectInput = {
  recordingId: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
  asset?: VideoProjectAsset;
  trackRole?: VideoProjectTrackRoleValue;
};

export function createRecordingSidecarClip(params: {
  asset: VideoProjectAsset;
  projectHeight: number;
  projectWidth: number;
  trackId: string;
  trackRole?: VideoProjectTrackRoleValue;
}): VideoProjectClip {
  const clip = createVideoClipFromAsset(
    params.trackId,
    params.asset,
    params.projectWidth,
    params.projectHeight,
    0,
    { muted: true }
  );
  if (clip.type !== VideoProjectClipType.VIDEO) {
    return clip;
  }

  return {
    ...clip,
    fitMode: VideoMediaFitMode.SOURCE_100,
    transform:
      params.trackRole === VideoProjectTrackRole.CAMERA
        ? {
            ...clip.transform,
            ...resolveVideoProjectCameraPlacement({
              placement: VideoProjectCameraPlacement.BOTTOM_RIGHT,
              projectHeight: params.projectHeight,
              projectWidth: params.projectWidth,
              sourceHeight: params.asset.metadata.height,
              sourceWidth: params.asset.metadata.width,
            }),
          }
        : createVideoProjectTransform(params.asset.metadata.width, params.asset.metadata.height),
  };
}

export function createRecordingSidecarAssets(
  sidecarVideos: RecordingSidecarVideoProjectInput[] | undefined
): VideoProjectAsset[] {
  return (sidecarVideos ?? []).map(
    (sidecar) => sidecar.asset ?? createRecordingProjectAsset(sidecar)
  );
}
