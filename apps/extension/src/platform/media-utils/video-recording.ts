import {
  getVideoRecordingMimeTypeCandidates,
  resolveVideoOutputProfile,
  resolveVideoTargetBitrate,
  type VideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

type VideoRecordingEncodingSettings = Pick<VideoRecordingSettings, 'outputProfile'>;

type VideoRecordingArtifact = {
  extension: 'mp4' | 'webm';
  mimeType: 'video/mp4' | 'video/webm';
};

export function applyVideoTrackContentHint(
  track: MediaStreamTrack,
  hint: 'detail' | 'motion' | 'text'
): void {
  if (!('contentHint' in track)) return;
  try {
    track.contentHint = hint;
  } catch {
    // Content hints are advisory and must not block capture on partial browser implementations.
  }
}

export function resolveVideoRecordingFrameRate(
  settings: Pick<VideoRecordingSettings, 'outputProfile'>
): number {
  return resolveVideoOutputProfile(settings).frameRate;
}

export function resolveVideoRecordingArtifact(mimeType: string): VideoRecordingArtifact {
  const containerMimeType = mimeType.toLowerCase().split(';', 1)[0]?.trim();
  if (containerMimeType === 'video/mp4') {
    return { extension: 'mp4', mimeType: 'video/mp4' };
  }
  if (containerMimeType === 'video/webm') {
    return { extension: 'webm', mimeType: 'video/webm' };
  }
  throw new Error(`Unsupported recorded video MIME type: ${mimeType || '(empty)'}`);
}

function readVideoTrackSettings(stream: MediaStream): MediaTrackSettings {
  const tracks =
    typeof stream.getVideoTracks === 'function'
      ? stream.getVideoTracks()
      : ([] as MediaStreamTrack[]);
  return tracks[0]?.getSettings() ?? {};
}

function hasAudioTracks(stream: MediaStream): boolean {
  return typeof stream.getAudioTracks === 'function' && stream.getAudioTracks().length > 0;
}

function requirePositiveTrackSetting(
  settings: MediaTrackSettings,
  key: 'frameRate' | 'height' | 'width'
): number {
  const value = settings[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Recording video track ${key} is unavailable`);
  }
  return value;
}

function resolveSupportedVideoRecordingMimeType(params: {
  hasAudioTracks: boolean;
  outputProfile: VideoOutputProfile;
}): string {
  const candidates = getVideoRecordingMimeTypeCandidates(
    params.outputProfile,
    params.hasAudioTracks
  );
  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!supported) {
    throw new Error('The selected recording container and codec are not supported');
  }

  return supported;
}

export function buildVideoMediaRecorderOptions(
  settings: VideoRecordingEncodingSettings,
  stream: MediaStream,
  authoritativeInputSettings?: MediaTrackSettings
): MediaRecorderOptions {
  const outputProfile = resolveVideoOutputProfile(settings);
  const trackSettings = authoritativeInputSettings ?? readVideoTrackSettings(stream);
  const width = requirePositiveTrackSetting(trackSettings, 'width');
  const height = requirePositiveTrackSetting(trackSettings, 'height');
  const fps = requirePositiveTrackSetting(trackSettings, 'frameRate');

  return {
    mimeType: resolveSupportedVideoRecordingMimeType({
      hasAudioTracks: hasAudioTracks(stream),
      outputProfile,
    }),
    videoBitsPerSecond: resolveVideoTargetBitrate({
      fps,
      height,
      quality: outputProfile.quality,
      resolution: outputProfile.resolution,
      width,
    }),
  };
}
