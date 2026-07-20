// policyStateIds: [] - native status parsers use static enum tables only.
import {
  appErrorCodes,
  hasLease,
  hasProtocolVersion,
  isAsciiId,
  isBoolean,
  isEnumValue,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
  isString,
} from './parser-shared';
import { isInstallState } from './parser-platform';
import type {
  NativeAppError,
  NativeAppStatus,
  NativeControllerIdentity,
  NativeSettingsWarning,
} from './types';
import {
  isNativeEffectiveSettings,
  isNativeSettingsWarning,
  isNativeSettingsWarnings,
} from './parser-settings';

const leaseStatuses = new Set(['granted', 'owned-by-other-profile', 'rejected']);
const browserFamilies = new Set(['chrome', 'edge', 'chromium', 'unknown']);

export function isControllerIdentity(value: unknown): value is NativeControllerIdentity {
  return (
    isRecord(value) &&
    isAsciiId(value['extensionId']) &&
    isEnumValue(value['browserFamily'], browserFamilies) &&
    isAsciiId(value['profileKey']) &&
    (value['documentId'] === undefined || isAsciiId(value['documentId'])) &&
    isAsciiId(value['connectionId'])
  );
}

export function isControllerLease(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isControllerIdentity(value['controller']) &&
    isPositiveInteger(value['expiresAtEpochMs']) &&
    isEnumValue(value['status'], leaseStatuses)
  );
}

export function isWarning(value: unknown): value is NativeSettingsWarning {
  return isNativeSettingsWarning(value);
}

export function isWarnings(value: unknown): value is NativeSettingsWarning[] {
  return isNativeSettingsWarnings(value);
}

export function isSettingsAccepted(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['revision']) &&
    isPositiveInteger(value['schemaVersion']) &&
    isPositiveInteger(value['acceptedAtEpochMs']) &&
    isNativeEffectiveSettings(value['effectiveSettings']) &&
    isWarnings(value['warnings'])
  );
}

export function isAppError(value: unknown): value is NativeAppError {
  return (
    isRecord(value) &&
    isString(value['code']) &&
    appErrorCodes.has(value['code']) &&
    (value['message'] === undefined ||
      (isString(value['message']) && value['message'].length <= 240)) &&
    isBoolean(value['recoverable'])
  );
}

function isRecordingStatus(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isAsciiId(value['recordingId']) &&
      isEnumValue(value['status'], new Set(['recording', 'paused', 'stopping', 'finalizing'])) &&
      isNonNegativeInteger(value['durationMs']))
  );
}

function isAppStatus(value: unknown): value is NativeAppStatus {
  return (
    isRecord(value) &&
    isBoolean(value['connectedBrowser']) &&
    isRecordingStatus(value['recording']) &&
    (value['lastError'] === null || isAppError(value['lastError'])) &&
    (value['settingsRevision'] === null || isAsciiId(value['settingsRevision'])) &&
    isInstallState(value['install'])
  );
}

export function isPong(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    isAsciiId(value['nonce']) &&
    isPositiveInteger(value['sentAtEpochMs']) &&
    isAppStatus(value['appStatus'])
  );
}
