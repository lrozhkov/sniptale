import { DEFAULT_TRACE_CONFIG, type TraceConfig } from '../message-tracer/types';
import { createSecretKeyFragmentList } from '../../security/secret-key-fragments';
import { safeStringify, sanitizeValue } from '../message-tracer/utils';
import {
  isDiagnosticUrlField,
  isStructuredUrlFieldKey,
  looksLikeDiagnosticUrl,
  redactDiagnosticUrlSecrets,
  sanitizeDiagnosticUrl,
} from './url-sanitizer';

export {
  isSensitiveDiagnosticQueryName,
  redactDiagnosticUrlSecrets,
  sanitizeDiagnosticUrl,
} from './url-sanitizer';

const DIAGNOSTIC_SANITIZE_KEYS = createSecretKeyFragmentList([
  'session',
  'text',
  'value',
  'html',
  'innerhtml',
  'outerhtml',
]);

const DIAGNOSTIC_TRACE_CONFIG: TraceConfig = {
  ...DEFAULT_TRACE_CONFIG,
  maxPayloadSize: 300,
  sanitizeKeys: Array.from(new Set(DIAGNOSTIC_SANITIZE_KEYS)),
};
const RAW_DIAGNOSTIC_EXPORT_MAX_DEPTH = 10;
const STRUCTURED_EXACT_DIAGNOSTIC_KEYS = new Set([
  'html',
  'innerhtml',
  'outerhtml',
  'text',
  'value',
]);
const STRUCTURED_EXACT_SECRET_KEYS = new Set(['credential', 'policy', 'sig', 'signature']);
const STRUCTURED_FRAGMENT_DIAGNOSTIC_KEYS = DIAGNOSTIC_SANITIZE_KEYS.map((fragment) =>
  fragment.toLowerCase()
).filter((fragment) => !STRUCTURED_EXACT_DIAGNOSTIC_KEYS.has(fragment));

function stringifySanitizedDiagnosticValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return safeStringify(value, DIAGNOSTIC_TRACE_CONFIG);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldSanitizeSignedAliasKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    STRUCTURED_EXACT_SECRET_KEYS.has(normalized) ||
    normalized.startsWith('x-amz-') ||
    normalized.startsWith('x-goog-')
  );
}

function sanitizeSignedAliasKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSignedAliasKeys);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      shouldSanitizeSignedAliasKey(key) ? '***' : sanitizeSignedAliasKeys(fieldValue),
    ])
  );
}

/**
 * Sanitizes arbitrary diagnostic payloads before they are persisted or exported.
 */
export function sanitizeDiagnosticData(value: unknown): unknown {
  return sanitizeSignedAliasKeys(sanitizeValue(value, DIAGNOSTIC_TRACE_CONFIG));
}

type DiagnosticUrlSanitizer = (url: string | undefined) => string | undefined;

function shouldSanitizeDiagnosticKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    STRUCTURED_EXACT_DIAGNOSTIC_KEYS.has(normalized) ||
    STRUCTURED_EXACT_SECRET_KEYS.has(normalized) ||
    normalized.startsWith('x-amz-') ||
    normalized.startsWith('x-goog-') ||
    STRUCTURED_FRAGMENT_DIAGNOSTIC_KEYS.some((fragment) => normalized.includes(fragment))
  );
}

function sanitizeStructuredDiagnosticExportObject(
  value: Record<string, unknown>,
  depth: number,
  sanitizeUrl: DiagnosticUrlSanitizer
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      shouldSanitizeDiagnosticKey(key)
        ? '***'
        : sanitizeStructuredDiagnosticExportValue(key, fieldValue, depth + 1, sanitizeUrl),
    ])
  );
}

function sanitizeStructuredDiagnosticExportValue(
  key: string,
  value: unknown,
  depth: number,
  sanitizeUrl: DiagnosticUrlSanitizer
): unknown {
  if (depth > RAW_DIAGNOSTIC_EXPORT_MAX_DEPTH) {
    return '[max depth]';
  }

  if (
    typeof value === 'string' &&
    (isStructuredUrlFieldKey(key) || looksLikeDiagnosticUrl(value))
  ) {
    return sanitizeUrl(value);
  }

  if (typeof value === 'string') {
    return sanitizeDiagnosticMessage(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeStructuredDiagnosticExportValue(key, item, depth + 1, sanitizeUrl)
    );
  }

  if (isRecord(value)) {
    return sanitizeStructuredDiagnosticExportObject(value, depth + 1, sanitizeUrl);
  }

  return value;
}

function sanitizeDiagnosticUrlFields(
  value: unknown,
  sanitizeUrl: (url: string | undefined) => string | undefined
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticUrlFields(item, sanitizeUrl));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      isDiagnosticUrlField(key) && typeof fieldValue === 'string'
        ? sanitizeUrl(fieldValue)
        : sanitizeDiagnosticUrlFields(fieldValue, sanitizeUrl),
    ])
  );
}

/**
 * Sanitizes diagnostic export payloads, including nested HAR/resource URL fields.
 */
export function sanitizeDiagnosticExportData(value: unknown): unknown {
  return sanitizeDiagnosticUrlFields(sanitizeDiagnosticData(value), sanitizeDiagnosticUrl);
}

/**
 * Sanitizes structured diagnostic exports without truncating owner-built JSON artifacts.
 */
export function sanitizeStructuredDiagnosticExportData(value: unknown): unknown {
  return sanitizeStructuredDiagnosticExportValue('', value, 0, sanitizeDiagnosticUrl);
}

/**
 * Sanitizes raw diagnostic exports while preserving safe URL query details.
 */
export function sanitizeRawDiagnosticExportData(value: unknown): unknown {
  return sanitizeStructuredDiagnosticExportValue('', value, 0, redactDiagnosticUrlSecrets);
}

/**
 * Builds a sanitized string preview for diagnostic messages and console arguments.
 */
export function stringifyDiagnosticValue(value: unknown): string {
  return stringifySanitizedDiagnosticValue(sanitizeDiagnosticData(value));
}

/**
 * Sanitizes user-visible diagnostic message text while keeping short summaries readable.
 */
export function sanitizeDiagnosticMessage(message: string): string {
  return stringifyDiagnosticValue(message);
}
