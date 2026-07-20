import type {
  CaptureMode as CaptureModeValue,
  VideoRecordingLiveMediaState,
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
  VideoViewportPresetSelection,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoMp4Codec,
} from '../../../features/video/project/types';
import { recordingStateHealthValues, type RecordingStateHealth } from '../contracts/response-types';
import type { Size2d, ViewportRegion } from '../contracts/types';
import {
  hasOptionalField,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '../validators/primitives';
import { isWebcamActualSettings, isWebcamQualitySettings } from './validators.webcam.ts';
import { isExportReadyVideoProject } from '../../../features/video/project/validation';
import { isBoundedVideoProjectExportSettings } from '../../../features/video/project/export/settings-validation';
export { isProjectExportInputReference } from '../../video/types/project-export-input';
export { isVideoExportCapabilities } from './validators.export-availability';

export {
  isRecordingTelemetrySnapshot,
  isViewportInfo,
} from '../../../features/video/project/validation/recording-telemetry';
export { isWebcamActualSettings, isWebcamQualitySettings } from './validators.webcam.ts';

const recordingStateHealthSet = new Set<RecordingStateHealth>(recordingStateHealthValues);
const videoExportFormatSet = new Set<string>(Object.values(VideoExportFormat));
const videoExportQualitySet = new Set<string>(Object.values(VideoExportQualityPreset));
const videoExportScopeSet = new Set<string>(Object.values(VideoExportScope));
const videoMp4CodecSet = new Set<string>(Object.values(VideoMp4Codec));
const captureModeSet = new Set<string>(Object.values(CaptureMode));

function isEnumValue(value: unknown, allowedValues: ReadonlySet<string>): value is string {
  return isString(value) && allowedValues.has(value);
}

export function isCaptureMode(value: unknown): value is CaptureModeValue {
  return isEnumValue(value, captureModeSet);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isSize2d(value: unknown): value is Size2d {
  return isRecord(value) && isNumber(value['width']) && isNumber(value['height']);
}

export function isViewportRegion(value: unknown): value is ViewportRegion {
  return (
    isRecord(value) &&
    isNumber(value['x']) &&
    isNumber(value['y']) &&
    isNumber(value['width']) &&
    isNumber(value['height'])
  );
}

export function isCaptureSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['mode']) &&
    isString(value['streamId']) &&
    !('streamCapabilityToken' in value)
  );
}

export function isVideoRecordingSettings(value: unknown): value is VideoRecordingSettings {
  return (
    isRecord(value) &&
    isBoolean(value['microphoneEnabled']) &&
    (value['microphoneDeviceId'] === null || isString(value['microphoneDeviceId'])) &&
    hasOptionalField(value, 'echoCancellation', isBoolean) &&
    hasOptionalField(value, 'noiseSuppression', isBoolean) &&
    hasOptionalField(value, 'autoGainControl', isBoolean) &&
    hasOptionalField(value, 'microphoneGain', isNumber) &&
    isBoolean(value['webcamEnabled']) &&
    (value['webcamDeviceId'] === null || isString(value['webcamDeviceId'])) &&
    hasOptionalField(value, 'webcamQuality', isWebcamQualitySettings) &&
    isBoolean(value['systemAudioEnabled']) &&
    hasOptionalField(value, 'sourceCount', isNumber) &&
    isString(value['quality']) &&
    isNumber(value['countdownSeconds']) &&
    isNumber(value['autoFadeDelay']) &&
    isBoolean(value['openEditorAfterRecording']) &&
    isBoolean(value['diagnosticsEnabled']) &&
    hasOptionalField(value, 'controlledCursorCaptureEnabled', isBoolean)
  );
}

export function isVideoViewportPresetSelection(
  value: unknown
): value is VideoViewportPresetSelection {
  return (
    isRecord(value) &&
    isNumber(value['width']) &&
    isNumber(value['height']) &&
    hasOptionalField(value, 'id', isString) &&
    hasOptionalField(value, 'label', isString)
  );
}

export function isVideoRecordingLiveMediaState(
  value: unknown
): value is VideoRecordingLiveMediaState {
  return (
    isRecord(value) &&
    (value['microphoneDeviceId'] === null || isString(value['microphoneDeviceId'])) &&
    isBoolean(value['microphoneEnabled']) &&
    isBoolean(value['microphoneSelected']) &&
    (value['webcamDeviceId'] === null || isString(value['webcamDeviceId'])) &&
    isBoolean(value['webcamEnabled']) &&
    isBoolean(value['webcamSelected']) &&
    (value['webcamSettings'] === undefined ||
      value['webcamSettings'] === null ||
      isWebcamActualSettings(value['webcamSettings']))
  );
}

export function isVideoRecordingRuntimeState(value: unknown): value is VideoRecordingRuntimeState {
  return (
    isRecord(value) &&
    isString(value['status']) &&
    isNumber(value['duration']) &&
    (value['countdownEndsAt'] === null || isNumber(value['countdownEndsAt'])) &&
    (value['captureMode'] === null || isCaptureMode(value['captureMode'])) &&
    (value['captureSource'] === null || isCaptureSource(value['captureSource'])) &&
    (value['viewportPreset'] === null || isVideoViewportPresetSelection(value['viewportPreset'])) &&
    (value['liveMedia'] === undefined ||
      value['liveMedia'] === null ||
      isVideoRecordingLiveMediaState(value['liveMedia'])) &&
    (value['error'] === null || isString(value['error']))
  );
}

export function isVideoProject(value: unknown): value is VideoProject {
  return isExportReadyVideoProject(value);
}

export function isVideoProjectExportSettings(value: unknown): value is VideoProjectExportSettings {
  if (
    !(
      isRecord(value) &&
      isNumber(value['width']) &&
      isNumber(value['height']) &&
      isNumber(value['fps']) &&
      isEnumValue(value['quality'], videoExportQualitySet) &&
      isEnumValue(value['format'], videoExportFormatSet) &&
      isBoolean(value['downloadAfterExport']) &&
      hasOptionalField(value, 'mp4VideoCodec', (entry) => isEnumValue(entry, videoMp4CodecSet)) &&
      hasOptionalField(value, 'scope', (entry) => isEnumValue(entry, videoExportScopeSet)) &&
      hasOptionalField(value, 'selectedClipIds', isStringArray) &&
      hasOptionalField(value, 'burnInSubtitles', isBoolean) &&
      hasOptionalField(value, 'subtitleSidecarFormats', isStringArray) &&
      hasOptionalField(value, 'rangeStartSeconds', isNumber) &&
      hasOptionalField(value, 'rangeEndSeconds', isNumber)
    )
  ) {
    return false;
  }

  return isBoundedVideoProjectExportSettings(value);
}

export function isRecordingStateHealth(value: unknown): value is RecordingStateHealth {
  return isString(value) && recordingStateHealthSet.has(value as RecordingStateHealth);
}
