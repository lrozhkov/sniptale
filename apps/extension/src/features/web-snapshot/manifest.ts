import {
  WebSnapshotCaptureMode,
  type WebSnapshotAssetManifestEntry,
  type WebSnapshotManifest,
  type WebSnapshotPackagePaths,
  type WebSnapshotSource,
  type WebSnapshotStats,
  type WebSnapshotViewport,
} from '@sniptale/runtime-contracts/web-snapshot';
import { isWebSnapshotAssetMimeType } from './asset-manifest';
import { sanitizeWebSnapshotSourceUrl } from './sanitize';

const WEB_SNAPSHOT_SCHEMA_VERSION = 1;

export const WEB_SNAPSHOT_PACKAGE_PATHS: WebSnapshotPackagePaths = {
  computedStyles: 'logs/css/computed-styles.json',
  domSnapshot: 'logs/dom.html',
  errors: 'logs/errors.log',
  manifest: 'manifest.json',
  screenshot: 'page-screenshot.png',
  snapshotHtml: 'snapshot/index.html',
  stylesheets: 'logs/css/stylesheets.json',
  virtualDomSnapshot: 'logs/virtual-dom.html',
};

const WEB_SNAPSHOT_ASSET_PATH_PATTERN = /^assets\/[^/]+$/u;
const WEB_SNAPSHOT_STYLESHEET_DIAGNOSTIC_PATH_PATTERN = /^logs\/css\/stylesheets\/[^/]+\.css$/u;

export function isAllowedWebSnapshotPackagePath(path: string): boolean {
  return (
    Object.values(WEB_SNAPSHOT_PACKAGE_PATHS).includes(path) ||
    WEB_SNAPSHOT_ASSET_PATH_PATTERN.test(path) ||
    WEB_SNAPSHOT_STYLESHEET_DIAGNOSTIC_PATH_PATTERN.test(path)
  );
}

export function assertSafeWebSnapshotPackagePath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error('Web snapshot package contains an unsafe path.');
  }

  if (!isAllowedWebSnapshotPackagePath(path)) {
    throw new Error('Web snapshot package contains an unexpected path.');
  }
}

export function createWebSnapshotManifest(args: {
  assets?: WebSnapshotAssetManifestEntry[];
  capturedAt?: string;
  id: string;
  packageSize?: number;
  source: WebSnapshotSource;
  stats?: Partial<WebSnapshotStats>;
  viewport?: WebSnapshotViewport;
  warnings?: string[];
}): WebSnapshotManifest {
  const stats = args.stats ?? {};
  const source: WebSnapshotSource = {
    faviconUrl:
      args.source.faviconUrl === null ? null : sanitizeWebSnapshotSourceUrl(args.source.faviconUrl),
    title: args.source.title,
    url: args.source.url === null ? null : sanitizeWebSnapshotSourceUrl(args.source.url),
  };

  const viewport = normalizeWebSnapshotViewport(args.viewport);

  return {
    ...(args.assets === undefined ? {} : { assets: args.assets }),
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: args.capturedAt ?? new Date().toISOString(),
    id: args.id,
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: WEB_SNAPSHOT_SCHEMA_VERSION,
    source,
    stats: {
      assetCount: stats.assetCount ?? 0,
      failedAssetCount: stats.failedAssetCount ?? 0,
      networkWarningCount: stats.networkWarningCount ?? stats.failedAssetCount ?? 0,
      packageSize: args.packageSize ?? stats.packageSize ?? 0,
      sanitizerWarningCount: stats.sanitizerWarningCount ?? 0,
      warningCount: stats.warningCount ?? args.warnings?.length ?? stats.failedAssetCount ?? 0,
    },
    ...(viewport === undefined ? {} : { viewport }),
    warnings: args.warnings ?? [],
  };
}

export function parseWebSnapshotManifestJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Web snapshot package manifest is invalid.');
  }
}

export function isWebSnapshotManifest(value: unknown): value is WebSnapshotManifest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value['schemaVersion'] === WEB_SNAPSHOT_SCHEMA_VERSION &&
    value['captureMode'] === WebSnapshotCaptureMode.ReadOnlyNoScripts &&
    typeof value['id'] === 'string' &&
    typeof value['capturedAt'] === 'string' &&
    isWebSnapshotSource(value['source']) &&
    isWebSnapshotPackagePaths(value['paths']) &&
    isWebSnapshotStats(value['stats']) &&
    (value['viewport'] === undefined || isWebSnapshotViewport(value['viewport'])) &&
    (value['assets'] === undefined || isWebSnapshotManifestAssets(value['assets'])) &&
    Array.isArray(value['warnings']) &&
    value['warnings'].every((warning) => typeof warning === 'string')
  );
}

function isWebSnapshotManifestAssets(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry['path'] === 'string' &&
        isWebSnapshotAssetMimeType(entry['mimeType']) &&
        typeof entry['sha256'] === 'string' &&
        /^[a-f0-9]{64}$/u.test(entry['sha256']) &&
        isNonNegativeFiniteNumber(entry['size'])
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isWebSnapshotSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value['faviconUrl'] === 'string' || value['faviconUrl'] === null) &&
    (typeof value['title'] === 'string' || value['title'] === null) &&
    (typeof value['url'] === 'string' || value['url'] === null)
  );
}

function isWebSnapshotPackagePaths(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(WEB_SNAPSHOT_PACKAGE_PATHS).every(
    ([key, expectedPath]) => value[key] === expectedPath
  );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeWebSnapshotViewport(
  viewport: WebSnapshotViewport | undefined
): WebSnapshotViewport | undefined {
  if (
    viewport === undefined ||
    !isPositiveFiniteNumber(viewport.height) ||
    !isPositiveFiniteNumber(viewport.width)
  ) {
    return undefined;
  }

  return {
    height: Math.max(1, Math.round(viewport.height)),
    width: Math.max(1, Math.round(viewport.width)),
  };
}

function isWebSnapshotViewport(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPositiveFiniteNumber(value['height']) &&
    isPositiveFiniteNumber(value['width'])
  );
}

function isWebSnapshotStats(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonNegativeFiniteNumber(value['assetCount']) &&
    isNonNegativeFiniteNumber(value['failedAssetCount']) &&
    (value['networkWarningCount'] === undefined ||
      isNonNegativeFiniteNumber(value['networkWarningCount'])) &&
    isNonNegativeFiniteNumber(value['packageSize']) &&
    (value['sanitizerWarningCount'] === undefined ||
      isNonNegativeFiniteNumber(value['sanitizerWarningCount'])) &&
    (value['warningCount'] === undefined || isNonNegativeFiniteNumber(value['warningCount']))
  );
}
