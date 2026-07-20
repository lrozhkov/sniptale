import {
  isSensitiveDiagnosticQueryName,
  redactDiagnosticUrlSecrets,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

export type HarHeader = { name: string; value: string };
export type HarQueryParam = { name: string; value: string };
export type HarSanitizationMode = 'raw' | 'sanitized';

const REDACTED_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'proxy-authorization',
  'set-cookie',
]);
const SENSITIVE_HEADER_NAME_FRAGMENTS = [
  'api-key',
  'apikey',
  'auth',
  'authorization',
  'bearer',
  'credential',
  'cookie',
  'csrf',
  'password',
  'passphrase',
  'secret',
  'session',
  'sig',
  'signature',
  'token',
  'xsrf',
];
const URL_VALUE_HEADER_NAMES = new Set(['content-location', 'location', 'referer', 'referrer']);
const URL_VALUE_HEADER_FRAGMENTS = ['href', 'link', 'url'];
const LINK_HEADER_URL_PATTERN = /<([^>]+)>/g;
const REFRESH_URL_PATTERN = /(\burl\s*=\s*)([^;,]+)/i;

function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    REDACTED_HEADER_NAMES.has(normalized) ||
    SENSITIVE_HEADER_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function isUrlValueHeaderName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    URL_VALUE_HEADER_NAMES.has(normalized) ||
    URL_VALUE_HEADER_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function sanitizeHeaderValue(name: string, value: string, mode: HarSanitizationMode): string {
  const normalized = name.toLowerCase();
  if (normalized === 'refresh') {
    return value.replace(REFRESH_URL_PATTERN, (_match, prefix: string, target: string) => {
      return `${prefix}${buildHarUrl(target.trim(), mode)}`;
    });
  }
  if (normalized === 'link') {
    return value.replace(LINK_HEADER_URL_PATTERN, (_match, target: string) => {
      return `<${buildHarUrl(target.trim(), mode)}>`;
    });
  }
  return isUrlValueHeaderName(name) ? buildHarUrl(value, mode) : value;
}

export function buildHarHeaders(
  headers: Record<string, string> | undefined,
  mode: HarSanitizationMode
): HarHeader[] {
  if (!headers) {
    return [];
  }

  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: isSensitiveHeaderName(name)
      ? '[redacted]'
      : sanitizeHeaderValue(name, String(value), mode),
  }));
}

function buildHarQueryParamValue(name: string, value: string, mode: HarSanitizationMode): string {
  return mode === 'sanitized' || isSensitiveDiagnosticQueryName(name) ? '[redacted]' : value;
}

export function buildHarQueryString(url: string, mode: HarSanitizationMode): HarQueryParam[] {
  try {
    return Array.from(new URL(url).searchParams.entries()).map(([name, value]) => ({
      name,
      value: buildHarQueryParamValue(name, value, mode),
    }));
  } catch {
    return [];
  }
}

export function buildHarUrl(url: string, mode: HarSanitizationMode): string {
  return mode === 'raw'
    ? (redactDiagnosticUrlSecrets(url) ?? url)
    : (sanitizeDiagnosticUrl(url) ?? url);
}
