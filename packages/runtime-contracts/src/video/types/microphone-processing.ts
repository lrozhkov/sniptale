import type { MicrophoneActualSettings, VideoRecordingSettings } from './types';

export const MICROPHONE_GAIN_MIN = 0;
export const MICROPHONE_GAIN_MAX = 2;
export const MICROPHONE_GAIN_DEFAULT = 1;

export type MicrophoneConstraintKey = 'echoCancellation' | 'noiseSuppression' | 'autoGainControl';

export const MICROPHONE_CONSTRAINT_KEYS = [
  'echoCancellation',
  'noiseSuppression',
  'autoGainControl',
] as const satisfies readonly MicrophoneConstraintKey[];

export type MicrophoneConstraintStatus =
  | 'applied'
  | 'unsupported'
  | 'not-confirmed'
  | 'unknown'
  | 'error';

export function resolveMicrophoneGain(settings: Pick<VideoRecordingSettings, 'microphoneGain'>) {
  const gain = settings.microphoneGain;
  if (typeof gain !== 'number' || !Number.isFinite(gain)) {
    return MICROPHONE_GAIN_DEFAULT;
  }

  return Math.max(MICROPHONE_GAIN_MIN, Math.min(MICROPHONE_GAIN_MAX, gain));
}

export function resolveMicrophoneBooleanSetting(
  settings: VideoRecordingSettings,
  key: MicrophoneConstraintKey
): boolean {
  return settings[key] ?? true;
}

export function buildMicrophoneAudioConstraints(
  settings: Pick<
    VideoRecordingSettings,
    'autoGainControl' | 'echoCancellation' | 'microphoneDeviceId' | 'noiseSuppression'
  >
): MediaTrackConstraints {
  return {
    echoCancellation: settings.echoCancellation ?? true,
    noiseSuppression: settings.noiseSuppression ?? true,
    autoGainControl: settings.autoGainControl ?? true,
    sampleRate: 48000,
    ...(settings.microphoneDeviceId ? { deviceId: { exact: settings.microphoneDeviceId } } : {}),
  };
}

export function pickMicrophoneActualSettings(
  settings: MediaTrackSettings
): MicrophoneActualSettings {
  return {
    ...(typeof settings.echoCancellation === 'boolean'
      ? { echoCancellation: settings.echoCancellation }
      : {}),
    ...(typeof settings.noiseSuppression === 'boolean'
      ? { noiseSuppression: settings.noiseSuppression }
      : {}),
    ...(typeof settings.autoGainControl === 'boolean'
      ? { autoGainControl: settings.autoGainControl }
      : {}),
    ...(typeof settings.sampleRate === 'number' ? { sampleRate: settings.sampleRate } : {}),
    ...(typeof settings.channelCount === 'number' ? { channelCount: settings.channelCount } : {}),
  };
}

export function getMicrophoneConstraintStatus({
  capabilities,
  desired,
  key,
  settings,
}: {
  capabilities: MediaTrackCapabilities | null;
  desired: boolean;
  key: MicrophoneConstraintKey;
  settings: MediaTrackSettings | null;
}): MicrophoneConstraintStatus {
  const capability = capabilities?.[key];
  if (Array.isArray(capability) && !capability.includes(desired)) {
    return 'unsupported';
  }

  const actual = settings?.[key];
  if (typeof actual === 'boolean') {
    return actual === desired ? 'applied' : 'not-confirmed';
  }

  return capability === undefined ? 'unknown' : 'not-confirmed';
}
