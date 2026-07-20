import { createVideoClipFromAsset, createVideoProjectTransform } from './clip';
import { createRecordingProjectAsset } from './recording';
import {
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectAsset,
  type VideoProjectClip,
} from '../types/index';

export type RecordingSidecarVideoProjectInput = {
  recordingId: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
  asset?: VideoProjectAsset;
};

export function createRecordingSidecarClip(params: {
  asset: VideoProjectAsset;
  projectHeight: number;
  projectWidth: number;
  trackId: string;
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
    transform: createVideoProjectTransform(
      params.asset.metadata.width,
      params.asset.metadata.height
    ),
  };
}

export function createRecordingSidecarAssets(
  sidecarVideos: RecordingSidecarVideoProjectInput[] | undefined
): VideoProjectAsset[] {
  return (sidecarVideos ?? []).map(
    (sidecar) => sidecar.asset ?? createRecordingProjectAsset(sidecar)
  );
}
