const MP4_AUDIO_RECORDING_MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
] as const;

const MP4_VIDEO_RECORDING_MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1.4d0028',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
] as const;

const DERIVED_STREAM_WEBM_MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp8',
  'video/webm',
  'video/webm;codecs=vp9',
] as const;

function getFirstSupportedMimeType(candidates: readonly string[]): string | null {
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function resolveRecordingStartMimeType(params: {
  fallbackMimeType: () => string;
  hasAudioTracks: boolean;
  preferredMimeType: string;
  usesDerivedVideoStream: boolean;
}): string {
  const mp4MimeType = getFirstSupportedMimeType(
    params.hasAudioTracks
      ? MP4_AUDIO_RECORDING_MIME_TYPE_CANDIDATES
      : MP4_VIDEO_RECORDING_MIME_TYPE_CANDIDATES
  );
  if (mp4MimeType) {
    return mp4MimeType;
  }

  if (params.hasAudioTracks || !params.usesDerivedVideoStream) {
    return MediaRecorder.isTypeSupported(params.preferredMimeType)
      ? params.preferredMimeType
      : params.fallbackMimeType();
  }

  return (
    getFirstSupportedMimeType(DERIVED_STREAM_WEBM_MIME_TYPE_CANDIDATES) ?? params.fallbackMimeType()
  );
}
