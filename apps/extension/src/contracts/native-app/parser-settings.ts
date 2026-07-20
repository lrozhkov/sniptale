// policyStateIds: [] - native settings parsers use static enum tables only.
import {
  VideoQuality,
  type NativeCaptureSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { NATIVE_TRAY_ACTION_KEYS } from '@sniptale/runtime-contracts/video/types/native-settings';
import {
  appErrorCodes,
  isBoolean,
  isEnumValue,
  isFiniteNumber,
  isRecord,
  isString,
} from './parser-shared';
import type {
  NativeEffectiveQualitySettings,
  NativeEffectiveSettings,
  NativeRequestedQualitySettings,
  NativeSettingsWarning,
} from './types';

const nativeFrameRates = new Set<unknown>(['auto', 24, 30, 60]);
const nativeAudioBitrates = new Set<unknown>([96, 128, 160, 192]);
const nativeAudioModes = new Set(['microphone', 'system', 'mixed']);
const nativeHardwareAcceleration = new Set(['prefer', 'force-software']);
const nativeQualityLevels = new Set<string>(Object.values(VideoQuality));
const nativeEffectiveEncoders = new Set(['hardware', 'software']);
const settingsWarningCodes = new Set([...appErrorCodes, 'clamped']);

function isNativeFrameRate(value: unknown): boolean {
  return nativeFrameRates.has(value);
}

function isNativeBitrateOverride(value: unknown): boolean {
  return value === null || (isFiniteNumber(value) && value >= 2 && value <= 80);
}

export function isNativeSettingsWarning(value: unknown): value is NativeSettingsWarning {
  return (
    isRecord(value) &&
    isString(value['code']) &&
    settingsWarningCodes.has(value['code']) &&
    (value['field'] === undefined || (isString(value['field']) && value['field'].length <= 80)) &&
    (value['message'] === undefined ||
      (isString(value['message']) && value['message'].length <= 240))
  );
}

export function isNativeSettingsWarnings(value: unknown): value is NativeSettingsWarning[] {
  return Array.isArray(value) && value.length <= 32 && value.every(isNativeSettingsWarning);
}

export function isNativeRequestedQualitySettings(
  value: unknown
): value is NativeRequestedQualitySettings {
  return (
    isRecord(value) &&
    nativeAudioBitrates.has(value['audioBitrateKbps']) &&
    isString(value['audioSourceMode']) &&
    isEnumValue(value['audioSourceMode'], nativeAudioModes) &&
    isNativeFrameRate(value['frameRate']) &&
    isString(value['quality']) &&
    isEnumValue(value['quality'], nativeQualityLevels) &&
    isNativeBitrateOverride(value['videoBitrateMbpsOverride'])
  );
}

export function isNativeEffectiveQualitySettings(
  value: unknown
): value is NativeEffectiveQualitySettings {
  if (!isRecord(value) || !isNativeRequestedQualitySettings(value)) {
    return false;
  }
  const record: Record<string, unknown> = value;
  return (
    isFiniteNumber(record['effectiveAudioBitrateKbps']) &&
    record['effectiveAudioBitrateKbps'] > 0 &&
    isFiniteNumber(record['effectiveFps']) &&
    record['effectiveFps'] > 0 &&
    isFiniteNumber(record['effectiveVideoBitrateMbps']) &&
    record['effectiveVideoBitrateMbps'] > 0 &&
    isString(record['encoder']) &&
    isEnumValue(record['encoder'], nativeEffectiveEncoders) &&
    isNativeSettingsWarnings(record['warnings'])
  );
}

export function isNativeCaptureSettings(value: unknown): value is NativeCaptureSettings {
  if (
    !isRecord(value) ||
    !isRecord(value['screenshots']) ||
    !isRecord(value['trayActions']) ||
    !isRecord(value['video'])
  ) {
    return false;
  }

  return (
    isNativeScreenshotSettings(value['screenshots']) &&
    isNativeTrayActionSettings(value['trayActions']) &&
    isNativeVideoSettings(value['video'])
  );
}

function isNativeScreenshotSettings(value: unknown): boolean {
  return isRecord(value) && isBoolean(value['includeCursor']);
}

function isNativeTrayActionSettings(value: unknown): boolean {
  return (
    isRecord(value) && NATIVE_TRAY_ACTION_KEYS.every((key) => isNativeTrayActionSetting(value[key]))
  );
}

function isNativeTrayActionSetting(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['enabled']) &&
    isBoolean(value['offlineCapable']) &&
    isString(value['shortcutLabel']) &&
    value['shortcutLabel'].length <= 40
  );
}

function isNativeVideoSettings(video: unknown): boolean {
  if (!isRecord(video)) {
    return false;
  }
  if (!isRecord(video['advanced']) || !isRecord(video['codec']) || !isRecord(video['telemetry'])) {
    return false;
  }

  const advanced = video['advanced'];
  const codec = video['codec'];
  const telemetry = video['telemetry'];
  return (
    isBoolean(video['enabled']) &&
    nativeAudioBitrates.has(advanced['audioBitrateKbps']) &&
    isString(advanced['audioSourceMode']) &&
    isEnumValue(advanced['audioSourceMode'], nativeAudioModes) &&
    isNativeFrameRate(advanced['frameRate']) &&
    isBoolean(advanced['includeCursorInVideo']) &&
    isFiniteNumber(advanced['maxDurationMinutes']) &&
    advanced['maxDurationMinutes'] >= 1 &&
    advanced['maxDurationMinutes'] <= 720 &&
    isBoolean(advanced['preferHardwareEncoder']) &&
    isNativeBitrateOverride(advanced['videoBitrateMbpsOverride']) &&
    codec['audioCodec'] === 'aac' &&
    codec['container'] === 'mp4' &&
    isString(codec['hardwareAcceleration']) &&
    isEnumValue(codec['hardwareAcceleration'], nativeHardwareAcceleration) &&
    codec['videoCodec'] === 'h264' &&
    isBoolean(telemetry['collectCursor']) &&
    isBoolean(telemetry['collectClicks']) &&
    isBoolean(telemetry['collectKeyEvents']) &&
    isBoolean(telemetry['collectTypingSpans']) &&
    isBoolean(telemetry['collectStaticSignals'])
  );
}

export function isNativeEffectiveSettings(value: unknown): value is NativeEffectiveSettings {
  return (
    isRecord(value) &&
    isNativeScreenshotSettings(value['screenshots']) &&
    isNativeVideoSettings(value['video']) &&
    isNativeSettingsWarnings(value['warnings'])
  );
}
