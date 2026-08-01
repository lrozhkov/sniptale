import { translate } from '../../../../../platform/i18n';
import {
  getDefaultVideoOutputCodec,
  getVideoRecordingMimeTypeCandidates,
  isVideoOutputCodecCompatible,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
  type VideoOutputProfile,
} from '@sniptale/runtime-contracts/video/types/types';

const OUTPUT_CODECS = [VideoOutputCodec.VP9, VideoOutputCodec.VP8, VideoOutputCodec.AVC] as const;

export const OUTPUT_RESOLUTION_PRESETS = [
  VideoResolutionPreset.SOURCE,
  VideoResolutionPreset.P240,
  VideoResolutionPreset.P360,
  VideoResolutionPreset.P480,
  VideoResolutionPreset.P720,
  VideoResolutionPreset.P1080,
  VideoResolutionPreset.P1440,
  VideoResolutionPreset.P2160,
] as const;

export function getOutputContainerLabel(container: VideoOutputContainer): string {
  return container === VideoOutputContainer.WEBM ? 'WebM' : 'MP4';
}

export function getOutputCodecLabel(codec: VideoOutputCodec): string {
  switch (codec) {
    case VideoOutputCodec.AVC:
      return 'H.264 (AVC)';
    case VideoOutputCodec.VP8:
      return 'VP8';
    case VideoOutputCodec.VP9:
      return 'VP9';
  }
}

export function getOutputResolutionLabel(resolution: VideoResolutionPreset): string {
  switch (resolution) {
    case VideoResolutionPreset.SOURCE:
      return translate('popup.video.outputResolutionSource');
    case VideoResolutionPreset.P1440:
      return '1440p (2K)';
    case VideoResolutionPreset.P2160:
      return '2160p (4K)';
    case VideoResolutionPreset.P240:
    case VideoResolutionPreset.P360:
    case VideoResolutionPreset.P480:
    case VideoResolutionPreset.P720:
    case VideoResolutionPreset.P1080:
      return resolution.toLowerCase();
  }
}

function isRecordingOutputSupported(
  outputProfile: VideoOutputProfile,
  hasAudioTracks: boolean
): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return true;
  }
  return getVideoRecordingMimeTypeCandidates(outputProfile, hasAudioTracks).some((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  );
}

export function getAvailableOutputCodecs(
  container: VideoOutputContainer,
  current: VideoOutputProfile,
  hasAudioTracks: boolean
): VideoOutputCodec[] {
  return OUTPUT_CODECS.filter(
    (codec) =>
      isVideoOutputCodecCompatible(container, codec) &&
      isRecordingOutputSupported({ ...current, codec, container }, hasAudioTracks)
  );
}

export function resolveOutputForContainer(params: {
  container: VideoOutputContainer;
  current: VideoOutputProfile;
  hasAudioTracks: boolean;
}): VideoOutputProfile {
  const available = getAvailableOutputCodecs(
    params.container,
    params.current,
    params.hasAudioTracks
  );
  const codec = available.includes(params.current.codec)
    ? params.current.codec
    : (available[0] ?? getDefaultVideoOutputCodec(params.container));
  return { ...params.current, codec, container: params.container };
}
