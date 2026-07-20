// policyStateIds: [] - shared native parser helpers use static error-code tables only.
import { NATIVE_APP_PROTOCOL_VERSION } from '@sniptale/runtime-contracts/native-app/constants';
import type { NativeCapabilityUnavailableReason } from './types';
import {
  isBoolean,
  isNumber,
  isPlainRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';

export { isBoolean, isString };
export const isRecord = isPlainRecord;
export const isFiniteNumber = isNumber;

export type NativeAppParseRejectReason =
  | 'malformed-message'
  | 'native-message-too-large'
  | 'oversized-payload'
  | 'unsupported-version';

export type ParseResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: string; reason: NativeAppParseRejectReason };

const ASCII_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_FILENAME_PATTERN =
  /^(?!\.{1,2}$)(?![A-Za-z]:)(?!CON$|PRN$|AUX$|NUL$|COM[1-9]$|LPT[1-9]$)[^/\\]{1,180}$/i;

export const capabilityReasons = new Set<NativeCapabilityUnavailableReason>([
  'os-too-old',
  'encoder-missing',
  'device-busy',
  'permission-denied',
  'policy-denied',
  'unsupported-browser',
  'unsupported-profile',
  'unsupported-platform',
  'unsupported-display-server',
  'platform-permission-required',
  'notarization-invalid',
  'protected-content',
  'unknown',
]);

export const appErrorCodes = new Set([
  ...capabilityReasons,
  'malformed-message',
  'unsupported-version',
  'incompatible-settings',
  'stale-controller-lease',
  'duplicate-command',
  'unsupported-capability',
  'quota-exceeded',
  'hash-mismatch',
  'duplicate-or-replay',
  'oversized-payload',
  'storage-failed',
  'invalid-selection',
  'user-cancelled',
  'app-upgrade-required',
  'extension-upgrade-required',
  'incompatible-protocol',
  'repair-required',
  'disk-pressure',
  'native-message-too-large',
  'capture-source-lost',
  'audio-source-lost',
  'encoder-failed',
  'native-finalization-failed',
  'unknown',
]);

export function fail<TValue>(
  reason: NativeAppParseRejectReason,
  error: string
): ParseResult<TValue> {
  return { ok: false, reason, error };
}

export function ok<TValue>(value: TValue): ParseResult<TValue> {
  return { ok: true, value };
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isAsciiId(value: unknown): value is string {
  return isString(value) && ASCII_ID_PATTERN.test(value);
}

export function isSha256(value: unknown): value is string {
  return isString(value) && SHA256_PATTERN.test(value);
}

export function isSafeFilename(value: unknown): value is string {
  return (
    isString(value) &&
    SAFE_FILENAME_PATTERN.test(value) &&
    [...value].every((character) => character.charCodeAt(0) >= 32)
  );
}

export function isEnumValue(value: unknown, allowed: ReadonlySet<string>): boolean {
  return isString(value) && allowed.has(value);
}

export function isStringArray(
  value: unknown,
  allowed: ReadonlySet<string>,
  maxLength: number
): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((entry) => isEnumValue(entry, allowed))
  );
}

export function hasProtocolVersion(value: Record<string, unknown>): boolean {
  return value['protocolVersion'] === NATIVE_APP_PROTOCOL_VERSION;
}

export function hasLease(value: Record<string, unknown>): boolean {
  return isAsciiId(value['controllerLeaseId']);
}
