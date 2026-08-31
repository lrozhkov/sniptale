import { estimateUtf8Bytes } from '../validation/base64';
import { MAX_PAGE_PACKAGE_URL_BYTES } from './contracts';

export const MAX_PAGE_PACKAGE_URL_SOURCES = 32;
export const PAGE_PACKAGE_LOAD_TIMEOUT_BOUNDS_MS = { min: 5_000, max: 300_000 } as const;
export const PAGE_PACKAGE_SETTLE_DELAY_BOUNDS_MS = { min: 0, max: 30_000 } as const;
export const DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING = {
  loadTimeoutMs: 30_000,
  settleDelayMs: 2_000,
} as const;

export interface PagePackageCaptureTimingPolicy {
  loadTimeoutMs: number;
  settleDelayMs: number;
}

export type PagePackageCaptureSource =
  | { kind: 'tab'; tabId: number; title: string }
  | { kind: 'url'; url: string };

function isBoundedInteger(value: unknown, bounds: { min: number; max: number }): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= bounds.min &&
    value <= bounds.max
  );
}

export function parsePagePackageCaptureTimingPolicy(
  value: unknown
): PagePackageCaptureTimingPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !isBoundedInteger(record['loadTimeoutMs'], PAGE_PACKAGE_LOAD_TIMEOUT_BOUNDS_MS) ||
    !isBoundedInteger(record['settleDelayMs'], PAGE_PACKAGE_SETTLE_DELAY_BOUNDS_MS)
  ) {
    return null;
  }
  return {
    loadTimeoutMs: record['loadTimeoutMs'],
    settleDelayMs: record['settleDelayMs'],
  };
}

export function normalizePagePackageCaptureUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:/iu.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || !url.hostname) return null;
    const normalized = url.href;
    return estimateUtf8Bytes(normalized, MAX_PAGE_PACKAGE_URL_BYTES) <= MAX_PAGE_PACKAGE_URL_BYTES
      ? normalized
      : null;
  } catch {
    return null;
  }
}
