// policyStateIds: [] - native platform parsers use static enum tables only.
import {
  NATIVE_RECORDING_MAX_TOTAL_BYTES,
  NATIVE_SCREENSHOT_MAX_TOTAL_BYTES,
} from '@sniptale/runtime-contracts/native-app/constants';
import {
  capabilityReasons,
  hasProtocolVersion,
  isAsciiId,
  isBoolean,
  isEnumValue,
  isPositiveInteger,
  isRecord,
  isString,
  isStringArray,
} from './parser-shared';
import type {
  NativeAppCapabilities,
  NativeAutostartState,
  NativeCapabilityUnavailableReason,
  NativeInstallState,
  NativePlatform,
} from './types';

export const platformKinds = new Set(['windows', 'macos', 'linux']);
export const captureModes = new Set(['screen', 'active-window', 'all-screens', 'region']);
export const recordingModes = new Set(['screen', 'active-window', 'region']);

const platformArchs = new Set(['x64', 'arm64']);
const displayServers = new Set(['win32', 'quartz', 'wayland', 'x11', 'unknown']);
const packageKinds = new Set(['wix-msi', 'pkg', 'dmg', 'deb', 'rpm', 'appimage', 'tar', 'unknown']);
const autostartMethods = new Set([
  'windows-hkcu-run',
  'macos-launch-agent',
  'linux-systemd-user',
  'linux-xdg-autostart',
  'none',
  'unknown',
]);
const updateChannels = new Set(['stable', 'beta', 'dev']);
const packageIntegrityValues = new Set(['valid', 'invalid', 'unknown', 'unsupported']);

export function isPlatform(value: unknown): value is NativePlatform {
  return (
    isRecord(value) &&
    isEnumValue(value['kind'], platformKinds) &&
    isString(value['version']) &&
    value['version'].length <= 80 &&
    isEnumValue(value['arch'], platformArchs) &&
    (value['displayServer'] === undefined || isEnumValue(value['displayServer'], displayServers)) &&
    (value['packageKind'] === undefined || isEnumValue(value['packageKind'], packageKinds))
  );
}

function isAutostartState(value: unknown): value is NativeAutostartState {
  return (
    isRecord(value) &&
    isBoolean(value['supported']) &&
    isBoolean(value['enabled']) &&
    isEnumValue(value['method'], autostartMethods)
  );
}

export function isInstallState(value: unknown): value is NativeInstallState {
  return (
    isRecord(value) &&
    isPlatform(value['platform']) &&
    isString(value['appVersion']) &&
    isPositiveInteger(value['appCacheSchemaVersion']) &&
    isString(value['installerVersion']) &&
    isString(value['nativeHostManifestVersion']) &&
    isEnumValue(value['updateChannel'], updateChannels) &&
    isBoolean(value['signedBinary']) &&
    isBoolean(value['rollbackProtected']) &&
    isAutostartState(value['autostart']) &&
    (value['notarized'] === undefined || isBoolean(value['notarized'])) &&
    isEnumValue(value['packageIntegrity'], packageIntegrityValues)
  );
}

function isUnavailableReasonArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (entry: unknown) =>
        typeof entry === 'string' &&
        capabilityReasons.has(entry as NativeCapabilityUnavailableReason)
    )
  );
}

function isMicrophoneDevices(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        isAsciiId(entry['id']) &&
        isString(entry['label']) &&
        entry['label'].length <= 120 &&
        isBoolean(entry['isDefault']) &&
        isBoolean(entry['available'])
    )
  );
}

function isCapabilities(value: unknown): value is NativeAppCapabilities {
  const capture = isRecord(value) ? value['capture'] : null;
  const codecs = isRecord(value) ? value['codecs'] : null;
  const audio = isRecord(value) ? value['audio'] : null;
  const limits = isRecord(value) ? value['limits'] : null;

  return (
    isRecord(capture) &&
    isStringArray(capture['screenshotModes'], captureModes, 4) &&
    isStringArray(capture['videoModes'], recordingModes, 3) &&
    isBoolean(capture['supportsFreezeRegionSelection']) &&
    isRecord(codecs) &&
    isStringArray(codecs['containers'], new Set(['mp4']), 1) &&
    isStringArray(codecs['video'], new Set(['h264']), 1) &&
    isStringArray(codecs['audio'], new Set(['aac']), 1) &&
    isBoolean(codecs['hardwareEncoderAvailable']) &&
    isUnavailableReasonArray(codecs['unavailableReasons']) &&
    isRecord(audio) &&
    isMicrophoneDevices(audio['microphoneDevices']) &&
    isBoolean(audio['supportsMicrophone']) &&
    isBoolean(audio['supportsSystemAudio']) &&
    isBoolean(audio['supportsMixedAudio']) &&
    isUnavailableReasonArray(audio['unavailableReasons']) &&
    isRecord(limits) &&
    isPositiveInteger(limits['maxChunkBytes']) &&
    isPositiveInteger(limits['maxRecordingBytes']) &&
    limits['maxRecordingBytes'] <= NATIVE_RECORDING_MAX_TOTAL_BYTES &&
    isPositiveInteger(limits['maxScreenshotBytes']) &&
    limits['maxScreenshotBytes'] <= NATIVE_SCREENSHOT_MAX_TOTAL_BYTES &&
    isPositiveInteger(limits['maxFps']) &&
    isPositiveInteger(limits['maxWidth']) &&
    isPositiveInteger(limits['maxHeight'])
  );
}

function isNumberArray(value: unknown, maxLength: number): boolean {
  return Array.isArray(value) && value.length <= maxLength && value.every(isPositiveInteger);
}

export function isAppHello(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    isPositiveInteger(value['settingsSchemaVersion']) &&
    isString(value['minExtensionVersion']) &&
    isNumberArray(value['supportedProtocolVersions'], 8) &&
    isNumberArray(value['supportedSettingsSchemaVersions'], 8) &&
    isAsciiId(value['appInstanceId']) &&
    isPlatform(value['platform']) &&
    isInstallState(value['install']) &&
    isCapabilities(value['capabilities'])
  );
}
