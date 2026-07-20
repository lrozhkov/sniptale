import type { TraceConfig } from './types';
import { redactSensitiveString, sanitizeSensitiveError } from '../../security/secret-redaction';

const MAX_SANITIZE_DEPTH = 5;
const ARRAY_PREVIEW_LIMIT = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function safeStringify(
  value: unknown,
  _config: TraceConfig,
  space?: string | number
): string {
  const cache = new Set<object>();

  const replacer = (_key: string, val: unknown): unknown => {
    if (typeof val === 'object' && val !== null) {
      if (cache.has(val)) {
        return '[Circular]';
      }
      cache.add(val);
    }
    return val;
  };

  try {
    return JSON.stringify(value, replacer, space);
  } catch {
    return '[Unable to stringify]';
  }
}

export function sanitizeValue(value: unknown, config: TraceConfig, depth = 0): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return '[max depth]';

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value, config);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return sanitizeError(value, config);
  }

  if (value instanceof Blob) {
    return `[Blob: ${value.size} bytes, ${value.type}]`;
  }

  if (value instanceof File) {
    return `[File: ${value.name}, ${value.size} bytes]`;
  }

  if (Array.isArray(value)) {
    return sanitizeArray(value, config, depth + 1);
  }

  if (isRecord(value)) {
    return sanitizeObject(value, config, depth + 1);
  }

  return String(value);
}

function sanitizeString(value: string, config: TraceConfig): string {
  return redactSensitiveString(value, config.maxPayloadSize);
}

export function sanitizeTraceErrorText(error: unknown, config: TraceConfig): string {
  return redactSensitiveString(
    error instanceof Error ? error.message : String(error),
    config.maxPayloadSize
  );
}

function sanitizeError(
  error: Error,
  config: TraceConfig
): Record<string, string | boolean | undefined> {
  return sanitizeSensitiveError(error, config.maxPayloadSize);
}

function sanitizeArray(value: unknown[], config: TraceConfig, depth: number): unknown {
  if (value.length > ARRAY_PREVIEW_LIMIT * 2) {
    return [
      ...value.slice(0, ARRAY_PREVIEW_LIMIT).map((item) => sanitizeValue(item, config, depth + 1)),
      `... ${value.length - ARRAY_PREVIEW_LIMIT * 2} more items ...`,
      ...value.slice(-ARRAY_PREVIEW_LIMIT).map((item) => sanitizeValue(item, config, depth + 1)),
    ];
  }
  return value.map((item) => sanitizeValue(item, config, depth + 1));
}

function sanitizeObject(
  value: Record<string, unknown>,
  config: TraceConfig,
  depth: number
): Record<string, unknown> {
  const sanitizedKeyPatterns = config.sanitizeKeys.map((pattern) => pattern.toLowerCase());
  const entries = Object.keys(value).map((key) => {
    const val = value[key];
    const lowerKey = key.toLowerCase();
    const shouldSanitizeKey = sanitizedKeyPatterns.some((pattern) => lowerKey.includes(pattern));
    return [key, shouldSanitizeKey ? '***' : sanitizeValue(val, config, depth + 1)] as const;
  });
  const sanitized = Object.fromEntries(entries) as Record<string, unknown>;
  Object.setPrototypeOf(sanitized, null);

  return sanitized;
}
