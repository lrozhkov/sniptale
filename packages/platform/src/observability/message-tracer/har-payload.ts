import {
  isSensitiveUrlComponentName,
  redactSensitiveString,
} from '../../security/secret-redaction';
import { redactDiagnosticUrlSecrets } from '../diagnostics/url-sanitizer';

const EXPORT_STOP_HAR_MESSAGE_TYPE = 'EXPORT_STOP_HAR';
const HAR_TRACE_MAX_STRING_LENGTH = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeHarTraceString(value: string): string {
  return redactSensitiveString(value, HAR_TRACE_MAX_STRING_LENGTH);
}

function sanitizeHarTraceField(key: string, value: unknown): unknown {
  if (typeof value === 'string' && key.toLowerCase().endsWith('url')) {
    return redactDiagnosticUrlSecrets(value) ?? sanitizeHarTraceString(value);
  }

  return sanitizeHarTracePayloadValue(value);
}

function sanitizeHarTraceRecord(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    sanitized[key] = sanitizeHarTraceField(key, fieldValue);
  }

  if (
    typeof value['name'] === 'string' &&
    typeof value['value'] === 'string' &&
    isSensitiveUrlComponentName(value['name'])
  ) {
    sanitized['value'] = '[redacted]';
  }

  return sanitized;
}

function sanitizeHarTracePayloadValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeHarTraceString(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeHarTracePayloadValue);
  }

  if (isRecord(value)) {
    return sanitizeHarTraceRecord(value);
  }

  return value;
}

export function sanitizeHarTracePayload(messageType: string, payload: unknown): unknown {
  return messageType === EXPORT_STOP_HAR_MESSAGE_TYPE
    ? sanitizeHarTracePayloadValue(payload)
    : payload;
}
