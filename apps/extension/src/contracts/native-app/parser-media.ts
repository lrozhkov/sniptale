// policyStateIds: [] - native media parsers use static enum tables only.
import {
  NATIVE_CHUNK_MAX_BASE64_CHARS,
  NATIVE_RECORDING_MAX_TOTAL_BYTES,
  NATIVE_SCREENSHOT_MAX_TOTAL_BYTES,
} from '@sniptale/runtime-contracts/native-app/constants';
import {
  hasLease,
  hasProtocolVersion,
  isAsciiId,
  isBoolean,
  isEnumValue,
  isFiniteNumber,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
  isSafeFilename,
  isSha256,
  isString,
} from './parser-shared';
import { captureModes, recordingModes } from './parser-platform';
import {
  isNativeEffectiveQualitySettings,
  isNativeRequestedQualitySettings,
} from './parser-settings';
import { isAppError } from './parser-status';
import { isNativeTelemetrySnapshot } from './parser-telemetry';
import type { NativeRecordingSource, NativeRecordingTimebase } from './types';

const operationFailures = new Set([
  'handshake',
  'settings-sync',
  'tray-action',
  'open-settings',
  'command',
  'screenshot',
  'recording',
  'transfer',
  'telemetry',
  'install-health',
]);

export function isScreenshotStart(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['captureId']) &&
    isEnumValue(value['mode'], captureModes) &&
    isSafeFilename(value['filename']) &&
    value['mimeType'] === 'image/png' &&
    isPositiveInteger(value['totalBytes']) &&
    value['totalBytes'] <= NATIVE_SCREENSHOT_MAX_TOTAL_BYTES &&
    isPositiveInteger(value['width']) &&
    isPositiveInteger(value['height']) &&
    isPositiveInteger(value['chunkCount']) &&
    isSha256(value['sha256']) &&
    isBoolean(value['openEditor']) &&
    isPositiveInteger(value['capturedAtEpochMs'])
  );
}

function isBase64Payload(value: unknown): value is string {
  return (
    isString(value) &&
    value.length <= NATIVE_CHUNK_MAX_BASE64_CHARS &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

export function isScreenshotChunk(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['captureId']) &&
    isNonNegativeInteger(value['chunkIndex']) &&
    isNonNegativeInteger(value['chunkByteOffset']) &&
    isPositiveInteger(value['chunkRawBytes']) &&
    isSha256(value['chunkSha256']) &&
    isBase64Payload(value['base64'])
  );
}

export function isScreenshotCommit(value: Record<string, unknown>): boolean {
  return hasProtocolVersion(value) && hasLease(value) && isAsciiId(value['captureId']);
}

function isRecordingSource(value: unknown): value is NativeRecordingSource {
  const region = isRecord(value) ? value['region'] : null;
  return (
    isRecord(value) &&
    isEnumValue(value['mode'], recordingModes) &&
    (value['displayId'] === undefined || isAsciiId(value['displayId'])) &&
    (value['windowId'] === undefined || isAsciiId(value['windowId'])) &&
    (value['microphoneDeviceId'] === undefined ||
      value['microphoneDeviceId'] === null ||
      isAsciiId(value['microphoneDeviceId'])) &&
    (region === undefined ||
      (isRecord(region) &&
        isNonNegativeInteger(region['x']) &&
        isNonNegativeInteger(region['y']) &&
        isPositiveInteger(region['width']) &&
        isPositiveInteger(region['height'])))
  );
}

function isTimebase(value: unknown): value is NativeRecordingTimebase {
  return (
    isRecord(value) &&
    isAsciiId(value['id']) &&
    isPositiveInteger(value['startedAtEpochMs']) &&
    isString(value['startedAtMonotonicNs']) &&
    /^\d+$/.test(value['startedAtMonotonicNs']) &&
    value['units'] === 'milliseconds'
  );
}

export function isRecordingStarted(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['recordingId']) &&
    isRecordingSource(value['source']) &&
    isTimebase(value['timebase']) &&
    isAsciiId(value['requestedSettingsRevision']) &&
    isNativeRequestedQualitySettings(value['requestedQuality']) &&
    isNativeEffectiveQualitySettings(value['effectiveQuality']) &&
    isPositiveInteger(value['startedAtEpochMs'])
  );
}

export function isRecordingProgress(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['recordingId']) &&
    isNonNegativeInteger(value['durationMs']) &&
    isNonNegativeInteger(value['bytesWritten']) &&
    isEnumValue(value['status'], new Set(['recording', 'paused', 'stopping', 'finalizing']))
  );
}

export function isRecordingStopped(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['recordingId']) &&
    isNonNegativeInteger(value['durationMs']) &&
    isSafeFilename(value['filename']) &&
    value['mimeType'] === 'video/mp4' &&
    isPositiveInteger(value['totalBytes']) &&
    value['totalBytes'] <= NATIVE_RECORDING_MAX_TOTAL_BYTES &&
    isPositiveInteger(value['width']) &&
    isPositiveInteger(value['height']) &&
    isFiniteNumber(value['fps']) &&
    value['fps'] > 0 &&
    isPositiveInteger(value['chunkCount']) &&
    isSha256(value['sha256']) &&
    isNativeTelemetrySnapshot(value['telemetry']) &&
    isBoolean(value['openEditor'])
  );
}

export function isRecordingChunk(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    hasLease(value) &&
    isAsciiId(value['recordingId']) &&
    isNonNegativeInteger(value['chunkIndex']) &&
    isNonNegativeInteger(value['chunkByteOffset']) &&
    isPositiveInteger(value['chunkRawBytes']) &&
    isSha256(value['chunkSha256']) &&
    isBase64Payload(value['base64'])
  );
}

export function isOperationFailed(value: Record<string, unknown>): boolean {
  return (
    hasProtocolVersion(value) &&
    (value['controllerLeaseId'] === undefined || isAsciiId(value['controllerLeaseId'])) &&
    isEnumValue(value['operation'], operationFailures) &&
    (value['operationId'] === undefined || isAsciiId(value['operationId'])) &&
    isString(value['phase']) &&
    value['phase'].length <= 80 &&
    isAppError(value['error']) &&
    isPositiveInteger(value['occurredAtEpochMs'])
  );
}
