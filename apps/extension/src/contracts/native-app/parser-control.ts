// policyStateIds: [] - native control parsers use static enum tables only.
import {
  hasLease,
  hasProtocolVersion,
  isAsciiId,
  isEnumValue,
  isPositiveInteger,
  isString,
} from './parser-shared';

export const trayActionKinds = new Set([
  'open-settings',
  'capture-screenshot',
  'start-recording',
  'stop-recording',
  'pause-recording',
  'resume-recording',
  'open-gallery',
  'open-video-editor',
]);

const settingsSections = new Set([
  'native-app',
  'native-hotkeys',
  'native-screenshots',
  'native-video',
  'native-telemetry',
  'permissions',
]);

export function isTrayActionRequest(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['actionId']) &&
    isPositiveInteger(value['requestedAtEpochMs']) &&
    isAsciiId(value['invocationId'])
  );
}

export function isOpenSettingsRequest(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isEnumValue(value['section'], settingsSections) &&
    isPositiveInteger(value['requestedAtEpochMs']) &&
    isAsciiId(value['invocationId'])
  );
}

export function isCommandAccepted(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['commandId']) &&
    isEnumValue(value['operation'], new Set(['screenshot', 'recording'])) &&
    isPositiveInteger(value['acceptedAtEpochMs'])
  );
}

export function isNativeTrayActionKind(value: unknown): boolean {
  return isString(value) && trayActionKinds.has(value);
}
