import {
  CaptureMode,
  isVideoOutputProfile,
  isVideoCursorEffectSettings,
  normalizeVideoSourceCount,
  parseVideoRecordingProfiles,
  VIDEO_AUTO_FADE_DELAYS,
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  type VideoAutoFadeDelay,
  type VideoRecordingSettings,
  type VideoRecordingUiState,
  type VideoRecordingSurfaceSettings,
  type WebcamPresentationSettings,
  type WebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { isWebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/messages.surface';
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
        'cursorEffects',
      ].includes(key)
    ) ||
    !isBoolean(value['toolbarEnabled']) ||
    !isBoolean(value['cursorSpotlightEnabled']) ||
    !(
      value['cursorEffects'] === undefined || isVideoCursorEffectSettings(value['cursorEffects'])
    ) ||
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
    ...(value['cursorEffects'] ? { cursorEffects: value['cursorEffects'] } : {}),
  };
}

function parseOptionalWebcamPresentation(
  value: unknown
): ParsedFieldValue<WebcamPresentationSettings> {
  if (value === undefined) {
    return undefined;
  }

  if (!isWebcamPresentationSettings(value)) return INVALID_FIELD;

  return {
    mode: value.mode,
    shape: value.shape,
    center: { x: value['center']['x'], y: value['center']['y'] },
    sizeFraction: value['sizeFraction'],
    cropOffset: { x: value['cropOffset']['x'], y: value['cropOffset']['y'] },
    ...(typeof value['freePlacement'] === 'boolean'
      ? { freePlacement: value['freePlacement'] }
      : {}),
    ...(value.dockPosition ? { dockPosition: value.dockPosition } : {}),
    ...(value.appearance ? { appearance: { ...value.appearance } } : {}),
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
  ['warnWithoutMicrophone', parseOptionalBoolean],
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
  ['interactionDiagnosticsEnabled', parseOptionalBoolean],
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
