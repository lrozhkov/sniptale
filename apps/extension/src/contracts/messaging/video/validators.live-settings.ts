import { isBoolean, isRecord } from '../validators/primitives';

const LIVE_SETTINGS_KEYS = new Set([
  'autoGainControl',
  'echoCancellation',
  'microphoneDeviceId',
  'microphoneEnabled',
  'microphoneGain',
  'noiseSuppression',
  'webcamDeviceId',
  'webcamEnabled',
]);

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

export function isLiveVideoRecordingSettingsPatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => LIVE_SETTINGS_KEYS.has(key)) &&
    (value['microphoneEnabled'] === undefined || isBoolean(value['microphoneEnabled'])) &&
    (value['webcamEnabled'] === undefined || isBoolean(value['webcamEnabled'])) &&
    isOptionalNullableString(value['microphoneDeviceId']) &&
    isOptionalNullableString(value['webcamDeviceId']) &&
    (value['echoCancellation'] === undefined || isBoolean(value['echoCancellation'])) &&
    (value['noiseSuppression'] === undefined || isBoolean(value['noiseSuppression'])) &&
    (value['autoGainControl'] === undefined || isBoolean(value['autoGainControl'])) &&
    (value['microphoneGain'] === undefined ||
      (typeof value['microphoneGain'] === 'number' && Number.isFinite(value['microphoneGain'])))
  );
}
