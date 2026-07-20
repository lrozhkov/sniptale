import {
  CaptureMode,
  normalizeVideoSourceCount,
  VideoQuality,
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  type VideoRecordingSettings,
  type VideoRecordingUiState,
  type WebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  MICROPHONE_GAIN_MAX,
  MICROPHONE_GAIN_MIN,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import { INVALID_FIELD, type ParsedFieldValue } from './field-parser';
import { parseOptionalNativeSettings } from './native-guards';

interface ParsedVideoSettingsStorageValue {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<VideoRecordingSettings>;
}

interface ParsedVideoUiStateStorageValue {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<VideoRecordingUiState>;
}

const captureModes = new Set<VideoRecordingUiState['captureMode']>(Object.values(CaptureMode));
const videoQualities = new Set<VideoRecordingSettings['quality']>(Object.values(VideoQuality));
const webcamFrameRatePresets = new Set<WebcamQualitySettings['frameRate']>(
  Object.values(WebcamFrameRatePreset)
);
const webcamResolutionPresets = new Set<WebcamQualitySettings['resolution']>(
  Object.values(WebcamResolutionPreset)
);
function isVideoQuality(value: unknown): value is VideoRecordingSettings['quality'] {
  return isString(value) && videoQualities.has(value as VideoRecordingSettings['quality']);
}

function isCaptureMode(value: unknown): value is VideoRecordingUiState['captureMode'] {
  return isString(value) && captureModes.has(value as VideoRecordingUiState['captureMode']);
}

function parseOptionalBoolean(value: unknown): ParsedFieldValue<boolean> {
  if (value === undefined) {
    return undefined;
  }

  return isBoolean(value) ? value : INVALID_FIELD;
}

function parseOptionalNullableString(value: unknown): ParsedFieldValue<string | null> {
  if (value === undefined) {
    return undefined;
  }

  return value === null || isString(value) ? value : INVALID_FIELD;
}

function parseOptionalNumber(value: unknown): ParsedFieldValue<number> {
  if (value === undefined) {
    return undefined;
  }

  return isNumber(value) ? value : INVALID_FIELD;
}

function parseOptionalMicrophoneGain(value: unknown): ParsedFieldValue<number> {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined || parsed === INVALID_FIELD) {
    return parsed;
  }

  return Math.max(MICROPHONE_GAIN_MIN, Math.min(MICROPHONE_GAIN_MAX, parsed));
}

function parseOptionalVideoQuality(
  value: unknown
): ParsedFieldValue<VideoRecordingSettings['quality']> {
  if (value === undefined) {
    return undefined;
  }

  return isVideoQuality(value) ? value : INVALID_FIELD;
}

function parseOptionalWebcamQuality(
  value: unknown
): ParsedFieldValue<VideoRecordingSettings['webcamQuality']> {
  if (value === undefined) {
    return undefined;
  }

  if (
    !isRecord(value) ||
    !isString(value['frameRate']) ||
    !webcamFrameRatePresets.has(value['frameRate'] as WebcamQualitySettings['frameRate']) ||
    !isString(value['resolution']) ||
    !webcamResolutionPresets.has(value['resolution'] as WebcamQualitySettings['resolution'])
  ) {
    return INVALID_FIELD;
  }

  return {
    frameRate: value['frameRate'] as WebcamQualitySettings['frameRate'],
    resolution: value['resolution'] as WebcamQualitySettings['resolution'],
  };
}

function assignParsedVideoSettingsField<TKey extends keyof VideoRecordingSettings>(
  target: Partial<VideoRecordingSettings>,
  key: TKey,
  parsedField: ParsedFieldValue<VideoRecordingSettings[TKey]>
): number {
  if (parsedField === INVALID_FIELD) {
    return 1;
  }

  if (parsedField !== undefined) {
    target[key] = parsedField;
  }

  return 0;
}

const VIDEO_SETTINGS_FIELD_PARSERS = [
  ['microphoneEnabled', parseOptionalBoolean],
  ['microphoneDeviceId', parseOptionalNullableString],
  ['echoCancellation', parseOptionalBoolean],
  ['noiseSuppression', parseOptionalBoolean],
  ['autoGainControl', parseOptionalBoolean],
  ['microphoneGain', parseOptionalMicrophoneGain],
  ['webcamEnabled', parseOptionalBoolean],
  ['webcamDeviceId', parseOptionalNullableString],
  ['webcamQuality', parseOptionalWebcamQuality],
  ['systemAudioEnabled', parseOptionalBoolean],
  ['sourceCount', parseOptionalNumber],
  ['quality', parseOptionalVideoQuality],
  ['countdownSeconds', parseOptionalNumber],
  ['autoFadeDelay', parseOptionalNumber],
  ['openEditorAfterRecording', parseOptionalBoolean],
  ['diagnosticsEnabled', parseOptionalBoolean],
  ['controlledCursorCaptureEnabled', parseOptionalBoolean],
  ['native', parseOptionalNativeSettings],
] as const satisfies ReadonlyArray<
  readonly [
    keyof VideoRecordingSettings,
    (value: unknown) => ParsedFieldValue<VideoRecordingSettings[keyof VideoRecordingSettings]>,
  ]
>;

function parseVideoSettingsFields(
  value: Record<string, unknown>
): Pick<ParsedVideoSettingsStorageValue, 'invalidFieldCount' | 'value'> {
  const nextValue: Partial<VideoRecordingSettings> = {};
  let invalidFieldCount = 0;

  for (const [key, parser] of VIDEO_SETTINGS_FIELD_PARSERS) {
    invalidFieldCount += assignParsedVideoSettingsField(
      nextValue,
      key,
      parser(value[key]) as ParsedFieldValue<VideoRecordingSettings[typeof key]>
    );
  }

  if (nextValue.sourceCount !== undefined) {
    nextValue.sourceCount = normalizeVideoSourceCount(nextValue.sourceCount);
  }

  return { invalidFieldCount, value: nextValue };
}

export function parseStoredVideoSettings(value: unknown): ParsedVideoSettingsStorageValue {
  if (value === undefined) {
    return { value: {}, hasInvalidRoot: false, invalidFieldCount: 0 };
  }

  if (!isRecord(value)) {
    return { value: {}, hasInvalidRoot: true, invalidFieldCount: 0 };
  }

  return {
    ...parseVideoSettingsFields(value),
    hasInvalidRoot: false,
  };
}

export function parseStoredVideoUiState(value: unknown): ParsedVideoUiStateStorageValue {
  if (value === undefined) {
    return { value: {}, hasInvalidRoot: false, invalidFieldCount: 0 };
  }

  if (!isRecord(value)) {
    return { value: {}, hasInvalidRoot: true, invalidFieldCount: 0 };
  }

  const nextValue: Partial<VideoRecordingUiState> = {};
  let invalidFieldCount = 0;

  if (value['captureMode'] === undefined || isCaptureMode(value['captureMode'])) {
    if (value['captureMode'] !== undefined) {
      nextValue.captureMode = value['captureMode'];
    }
  } else {
    invalidFieldCount++;
  }

  if (
    value['viewportPresetId'] === undefined ||
    value['viewportPresetId'] === null ||
    isString(value['viewportPresetId'])
  ) {
    if (value['viewportPresetId'] !== undefined) {
      nextValue.viewportPresetId = value['viewportPresetId'];
    }
  } else {
    invalidFieldCount++;
  }

  return { value: nextValue, hasInvalidRoot: false, invalidFieldCount };
}
