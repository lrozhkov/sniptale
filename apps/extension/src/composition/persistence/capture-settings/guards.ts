import {
  CaptureMode,
  isVideoOutputProfile,
  normalizeVideoSourceCount,
  parseVideoRecordingProfiles,
  VIDEO_AUTO_FADE_DELAYS,
  WebcamFrameRatePreset,
  WebcamPresentationMode,
  WebcamPresentationShape,
  WebcamResolutionPreset,
  type VideoAutoFadeDelay,
  type VideoRecordingSettings,
  type VideoRecordingUiState,
  type VideoRecordingSurfaceSettings,
  type WebcamPresentationSettings,
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
const webcamFrameRatePresets = new Set<WebcamQualitySettings['frameRate']>(
  Object.values(WebcamFrameRatePreset)
);
const webcamResolutionPresets = new Set<WebcamQualitySettings['resolution']>(
  Object.values(WebcamResolutionPreset)
);
const videoAutoFadeDelays = new Set<number>(VIDEO_AUTO_FADE_DELAYS);
const webcamPresentationModes = new Set(Object.values(WebcamPresentationMode));
const webcamPresentationShapes = new Set(Object.values(WebcamPresentationShape));
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

function parseOptionalVideoAutoFadeDelay(value: unknown): ParsedFieldValue<VideoAutoFadeDelay> {
  if (value === undefined) {
    return undefined;
  }

  return isNumber(value) && videoAutoFadeDelays.has(value)
    ? (value as VideoAutoFadeDelay)
    : INVALID_FIELD;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return isNumber(value) && value >= minimum && value <= maximum;
}

function parseOptionalRecordingSurface(
  value: unknown
): ParsedFieldValue<VideoRecordingSurfaceSettings> {
  if (value === undefined) {
    return undefined;
  }

  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      [
        'toolbarEnabled',
        'cursorSpotlightEnabled',
        'cursorDimmingEnabled',
        'cursorClickAnimationEnabled',
      ].includes(key)
    ) ||
    !isBoolean(value['toolbarEnabled']) ||
    !isBoolean(value['cursorSpotlightEnabled']) ||
    !(value['cursorDimmingEnabled'] === undefined || isBoolean(value['cursorDimmingEnabled'])) ||
    !(
      value['cursorClickAnimationEnabled'] === undefined ||
      isBoolean(value['cursorClickAnimationEnabled'])
    )
  ) {
    return INVALID_FIELD;
  }

  return {
    toolbarEnabled: value['toolbarEnabled'],
    cursorSpotlightEnabled: value['cursorSpotlightEnabled'],
    cursorDimmingEnabled: value['cursorDimmingEnabled'] ?? false,
    cursorClickAnimationEnabled: value['cursorClickAnimationEnabled'] ?? false,
  };
}

function parseOptionalWebcamPresentation(
  value: unknown
): ParsedFieldValue<WebcamPresentationSettings> {
  if (value === undefined) {
    return undefined;
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['mode', 'shape', 'center', 'sizeFraction', 'cropOffset']) ||
    !isString(value['mode']) ||
    !webcamPresentationModes.has(value['mode'] as WebcamPresentationMode) ||
    !isString(value['shape']) ||
    !webcamPresentationShapes.has(value['shape'] as WebcamPresentationShape) ||
    !isRecord(value['center']) ||
    !hasExactKeys(value['center'], ['x', 'y']) ||
    !isBoundedNumber(value['center']['x'], 0, 1) ||
    !isBoundedNumber(value['center']['y'], 0, 1) ||
    !isBoundedNumber(value['sizeFraction'], 0, 1) ||
    value['sizeFraction'] === 0 ||
    !isRecord(value['cropOffset']) ||
    !hasExactKeys(value['cropOffset'], ['x', 'y']) ||
    !isBoundedNumber(value['cropOffset']['x'], -1, 1) ||
    !isBoundedNumber(value['cropOffset']['y'], -1, 1)
  ) {
    return INVALID_FIELD;
  }

  return {
    mode: value['mode'] as WebcamPresentationMode,
    shape: value['shape'] as WebcamPresentationShape,
    center: { x: value['center']['x'], y: value['center']['y'] },
    sizeFraction: value['sizeFraction'],
    cropOffset: { x: value['cropOffset']['x'], y: value['cropOffset']['y'] },
  };
}

function parseOptionalMicrophoneGain(value: unknown): ParsedFieldValue<number> {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined || parsed === INVALID_FIELD) {
    return parsed;
  }

  return Math.max(MICROPHONE_GAIN_MIN, Math.min(MICROPHONE_GAIN_MAX, parsed));
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

function parseOptionalVideoOutputProfile(
  value: unknown
): ParsedFieldValue<VideoRecordingSettings['outputProfile']> {
  if (value === undefined) {
    return undefined;
  }

  return isVideoOutputProfile(value) ? value : INVALID_FIELD;
}

function parseOptionalVideoQualityProfiles(
  value: unknown
): ParsedFieldValue<VideoRecordingSettings['qualityProfiles']> {
  if (value === undefined) {
    return undefined;
  }
  return parseVideoRecordingProfiles(value) ?? INVALID_FIELD;
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
  ['outputProfile', parseOptionalVideoOutputProfile],
  ['qualityProfileId', parseOptionalNullableString],
  ['qualityProfiles', parseOptionalVideoQualityProfiles],
  ['countdownSeconds', parseOptionalNumber],
  ['autoFadeDelay', parseOptionalVideoAutoFadeDelay],
  ['diagnosticsEnabled', parseOptionalBoolean],
  ['controlledCursorCaptureEnabled', parseOptionalBoolean],
  ['recordingSurface', parseOptionalRecordingSurface],
  ['webcamPresentation', parseOptionalWebcamPresentation],
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

  if (
    Object.hasOwn(value, 'quality') ||
    Object.hasOwn(value, 'output') ||
    !Object.hasOwn(value, 'outputProfile') ||
    !Object.hasOwn(value, 'qualityProfileId') ||
    !Object.hasOwn(value, 'qualityProfiles')
  ) {
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
