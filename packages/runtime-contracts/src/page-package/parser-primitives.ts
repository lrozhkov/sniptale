import {
  MAX_PAGE_PACKAGE_PATH_LENGTH,
  MAX_PAGE_PACKAGE_WARNING_BYTES,
  MAX_PAGE_PACKAGE_WARNINGS,
  MAX_PAGE_PACKAGE_WARNINGS_BYTES,
} from './contracts';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface BoundaryRecord extends Record<string, unknown> {
  capturedAt?: unknown;
  component?: unknown;
  components?: unknown;
  createdAt?: unknown;
  deviceScaleFactor?: unknown;
  diagnosticsLevel?: unknown;
  entries?: unknown;
  entryCount?: unknown;
  failedPageCount?: unknown;
  failedResourceCount?: unknown;
  faviconUrl?: unknown;
  height?: unknown;
  id?: unknown;
  intent?: unknown;
  kind?: unknown;
  manifestPath?: unknown;
  manifestSha256?: unknown;
  manifestSize?: unknown;
  mimeType?: unknown;
  ordinal?: unknown;
  pageCount?: unknown;
  pageId?: unknown;
  pages?: unknown;
  path?: unknown;
  requestedPageCount?: unknown;
  rootPath?: unknown;
  schemaVersion?: unknown;
  sha256?: unknown;
  size?: unknown;
  source?: unknown;
  stats?: unknown;
  status?: unknown;
  title?: unknown;
  totalBytes?: unknown;
  totalPageBytes?: unknown;
  url?: unknown;
  viewport?: unknown;
  warningCount?: unknown;
  warnings?: unknown;
  width?: unknown;
}

export function isRecord(value: unknown): value is BoundaryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isBoundedString(
  value: unknown,
  maxBytes: number,
  allowEmpty = false
): value is string {
  return (
    typeof value === 'string' && (allowEmpty || value.length > 0) && utf8Size(value) <= maxBytes
  );
}

export function isNfcBoundedString(
  value: unknown,
  maxBytes: number,
  allowEmpty = false
): value is string {
  return isBoundedString(value, maxBytes, allowEmpty) && value.normalize('NFC') === value;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

export function isCanonicalIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function addWithinSafeInteger(total: number, value: number): number | null {
  const next = total + value;
  return Number.isSafeInteger(next) ? next : null;
}

export function hasUnsafePathSegment(path: string): boolean {
  if (
    path.length === 0 ||
    path.length > MAX_PAGE_PACKAGE_PATH_LENGTH ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    path.normalize('NFC') !== path
  ) {
    return true;
  }
  return path.split('/').some((segment) => {
    if (segment === '' || segment === '.' || segment === '..') return true;
    return Array.from(segment).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
  });
}

export function parseWarnings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PAGE_PACKAGE_WARNINGS) return null;
  let totalBytes = 0;
  const warnings: string[] = [];
  for (const warning of value) {
    if (!isBoundedString(warning, MAX_PAGE_PACKAGE_WARNING_BYTES, true)) return null;
    totalBytes += utf8Size(warning);
    if (totalBytes > MAX_PAGE_PACKAGE_WARNINGS_BYTES) return null;
    warnings.push(warning);
  }
  return warnings;
}
