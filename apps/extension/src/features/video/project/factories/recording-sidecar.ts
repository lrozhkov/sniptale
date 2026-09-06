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
  groupId?: string | null;
  startTime?: number;
  sourceStart?: number;
  duration?: number;
}): VideoProjectClip {
  const clip = createVideoClipFromAsset(
    params.trackId,
    params.asset,
    params.projectWidth,
    params.projectHeight,
    params.startTime ?? 0,
    { muted: true, groupId: params.groupId ?? null }
  );
  if (clip.type !== VideoProjectClipType.VIDEO) {
    return clip;
  }

  const sourceStart = params.sourceStart ?? 0;
  const duration = Math.min(params.duration ?? clip.duration, clip.duration - sourceStart);
  return {
    ...clip,
    duration,
    sourceStart,
    sourceDuration: duration,
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
  sidecarVideos: RecordingSidecarVideoProjectInput[] | undefined,
  recordingId: string
): VideoProjectAsset[] {
  return (sidecarVideos ?? []).map((sidecar) => ({
    ...(sidecar.asset ?? createRecordingProjectAsset(sidecar)),
    recordingPart: {
      recordingId,
      role: sidecar.trackRole === VideoProjectTrackRole.CAMERA ? 'camera' : 'video',
    },
  }));
}
