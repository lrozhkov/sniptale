import { isBoolean, isRecord } from '../validators/primitives';

export function isLiveVideoRecordingSettingsPatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    (value['microphoneEnabled'] === undefined || isBoolean(value['microphoneEnabled'])) &&
    (value['webcamEnabled'] === undefined || isBoolean(value['webcamEnabled']))
  );
}
