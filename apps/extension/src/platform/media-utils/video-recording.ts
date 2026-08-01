import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  getVideoRecordingMimeTypeCandidates,
  resolveVideoOutputDimensions,
  resolveVideoRecordingOutputSettings,
  resolveVideoTargetBitrate,
  type VideoRecordingOutputSettings,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

type VideoRecordingEncodingSettings = Pick<VideoRecordingSettings, 'output' | 'quality'>;

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
  settings: Pick<VideoRecordingSettings, 'quality'>
): number {
  const config = VIDEO_QUALITY_CONFIGS[settings.quality];
  if (!config) throw new Error(`Unsupported video quality: ${String(settings.quality)}`);
  return config.frameRate;
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

function readResizeModes(track: MediaStreamTrack): string[] {
  try {
    const capabilities = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { resizeMode?: unknown })
      | undefined;
    const resizeMode: unknown = capabilities?.resizeMode;
    return Array.isArray(resizeMode)
      ? resizeMode.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
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
  output: VideoRecordingOutputSettings;
}): string {
  const candidates = getVideoRecordingMimeTypeCandidates(params.output, params.hasAudioTracks);
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
  if (!VIDEO_QUALITY_CONFIGS[settings.quality]) {
    throw new Error(`Unsupported video quality: ${String(settings.quality)}`);
  }
  const output = resolveVideoRecordingOutputSettings(settings);
  const trackSettings = authoritativeInputSettings ?? readVideoTrackSettings(stream);
  const width = requirePositiveTrackSetting(trackSettings, 'width');
  const height = requirePositiveTrackSetting(trackSettings, 'height');
  const fps = requirePositiveTrackSetting(trackSettings, 'frameRate');

  return {
    mimeType: resolveSupportedVideoRecordingMimeType({
      hasAudioTracks: hasAudioTracks(stream),
      output,
    }),
    videoBitsPerSecond: resolveVideoTargetBitrate({
      fps,
      height,
      quality: settings.quality,
      width,
    }),
  };
}

export async function applyVideoRecordingOutputConstraints(
  stream: MediaStream,
  settings: VideoRecordingEncodingSettings
): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.applyConstraints !== 'function') {
    throw new Error('Recording output is missing a configurable video track');
  }

  const frameRate = resolveVideoRecordingFrameRate(settings);
  const output = resolveVideoRecordingOutputSettings(settings);
  const trackSettings = track.getSettings();
  const width = requirePositiveTrackSetting(trackSettings, 'width');
  const height = requirePositiveTrackSetting(trackSettings, 'height');
  const target = resolveVideoOutputDimensions(width, height, output.resolution);
  const constraints: MediaTrackConstraints & { resizeMode?: string } = {
    frameRate: { ideal: frameRate, max: frameRate },
    width: { ideal: target.width, max: target.width },
    height: { ideal: target.height, max: target.height },
  };

  if (readResizeModes(track).includes('crop-and-scale')) {
    constraints.resizeMode = 'crop-and-scale';
  }

  await track.applyConstraints(constraints);
  const applied = track.getSettings();
  if (applied.width !== target.width || applied.height !== target.height) {
    const receivedDimensions = `${applied.width ?? 'unknown'}x${applied.height ?? 'unknown'}`;
    throw new Error(
      `The selected recording resolution was not applied: ` +
        `expected ${target.width}x${target.height}, received ${receivedDimensions}`
    );
  }
  const appliedFrameRate = requirePositiveTrackSetting(applied, 'frameRate');
  if (appliedFrameRate > frameRate) {
    throw new Error(
      `The selected recording frame-rate ceiling was not applied: ` +
        `expected at most ${frameRate}, received ${appliedFrameRate}`
    );
  }
}
