/** Released dd7c3b645 manifest admission. Keep its accepted layouts unchanged. */
import {
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
} from '../../../../composition/archive-transfer';
import {
  MEDIA_HUB_BACKUP_FORMAT,
  MEDIA_HUB_BACKUP_VERSION,
  type MediaHubBackupCatalogShard,
  type MediaHubBackupManifestV6,
  type MediaHubBackupPrivacyFlags,
} from '../contracts';
import { assertV6CatalogPath } from '../layout';
import { parseBackupSharedObjects } from '../shared-objects';
import { parsePortableGallerySavedViews } from '../../../../composition/persistence/gallery-saved-views';
const MAX_JSON_STRING_LENGTH = 1024 * 1024;
const MEDIA_HUB_BACKUP_LAYOUT = 'library-folders-v1';
const MEDIA_HUB_BACKUP_PAYLOAD_LAYOUT = 'library-folders-v2';
const MEDIA_HUB_BACKUP_SHARED_LAYOUT = 'library-folders-v3';
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error('Media backup JSON contains missing or unknown fields.');
  }
}

function parseSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Media backup ${label} is invalid.`);
  }
  return Number(value);
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_JSON_STRING_LENGTH) {
    throw new Error(`Media backup ${label} is invalid.`);
  }
  return value;
}

function parsePrivacyFlags(value: unknown): MediaHubBackupPrivacyFlags {
  if (!isPlainRecord(value)) throw new Error('Media backup privacy flags are invalid.');
  assertExactKeys(value, ['includeSourceMetadata', 'includeTelemetry', 'includeWebSnapshots']);
  if (
    typeof value['includeSourceMetadata'] !== 'boolean' ||
    typeof value['includeTelemetry'] !== 'boolean' ||
    typeof value['includeWebSnapshots'] !== 'boolean'
  ) {
    throw new Error('Media backup privacy flags are invalid.');
  }
  return {
    includeSourceMetadata: value['includeSourceMetadata'],
    includeTelemetry: value['includeTelemetry'],
    includeWebSnapshots: value['includeWebSnapshots'],
  };
}

function parseCatalogShard(value: unknown): MediaHubBackupCatalogShard {
  if (!isPlainRecord(value)) throw new Error('Media backup catalog descriptor is invalid.');
  const media = value['rootKind'] === 'media';
  assertExactKeys(
    value,
    ['path', 'rootKind', 'rootCount', 'objectCount', 'totalBytes'],
    media ? ['mediaSubtype'] : []
  );
  const path = parseNonEmptyString(value['path'], 'catalog path');
  assertV6CatalogPath(path);
  const rootKind = value['rootKind'];
  if (rootKind !== 'media' && rootKind !== 'video-project' && rootKind !== 'scenario-project') {
    throw new Error('Media backup catalog root kind is invalid.');
  }
  const objectCount = parseSafeInteger(value['objectCount'], 'catalog object count');
  const rootCount = parseSafeInteger(value['rootCount'], 'catalog root count');
  const totalBytes = parseSafeInteger(value['totalBytes'], 'catalog byte total');
  if (rootKind !== 'media') {
    return { objectCount, path, rootCount, rootKind, totalBytes };
  }
  const mediaSubtype = value['mediaSubtype'];
  if (mediaSubtype !== 'library-item' && mediaSubtype !== 'effect-bundle') {
    throw new Error('Media backup catalog media subtype is invalid.');
  }
  return { mediaSubtype, objectCount, path, rootCount, rootKind, totalBytes };
}

export function parseLegacyV3Manifest(value: unknown): MediaHubBackupManifestV6 {
  if (!isPlainRecord(value)) throw new Error('Media backup manifest is invalid.');
  if (
    value['format'] === MEDIA_HUB_BACKUP_FORMAT &&
    value['version'] === MEDIA_HUB_BACKUP_VERSION &&
    value['layout'] !== MEDIA_HUB_BACKUP_LAYOUT &&
    value['layout'] !== MEDIA_HUB_BACKUP_PAYLOAD_LAYOUT &&
    value['layout'] !== MEDIA_HUB_BACKUP_SHARED_LAYOUT
  ) {
    throw new Error('Unsupported media backup v6 layout. Create a new backup with this version.');
  }
  assertExactKeys(
    value,
    ['archiveId', 'catalogs', 'exportedAt', 'format', 'layout', 'privacy', 'totals', 'version'],
    value['layout'] === MEDIA_HUB_BACKUP_SHARED_LAYOUT
      ? ['galleryViews', 'sharedObjects']
      : ['galleryViews']
  );
  if (
    value['format'] !== MEDIA_HUB_BACKUP_FORMAT ||
    value['version'] !== MEDIA_HUB_BACKUP_VERSION ||
    (value['layout'] !== MEDIA_HUB_BACKUP_LAYOUT &&
      value['layout'] !== MEDIA_HUB_BACKUP_PAYLOAD_LAYOUT &&
      value['layout'] !== MEDIA_HUB_BACKUP_SHARED_LAYOUT)
  ) {
    throw new Error('Unsupported media backup format.');
  }
  if (!Array.isArray(value['catalogs']) || !isPlainRecord(value['totals'])) {
    throw new Error('Media backup manifest totals are invalid.');
  }
  const totals = value['totals'];
  if (
    value['layout'] === MEDIA_HUB_BACKUP_SHARED_LAYOUT &&
    (parseSafeInteger(totals['objects'], 'total objects') > MAX_MEDIA_ARCHIVE_ENTRIES ||
      parseSafeInteger(totals['bytes'], 'total bytes') > MAX_MEDIA_ARCHIVE_INFLATED_BYTES)
  )
    throw new Error('Media backup logical inventory exceeds its resource profile.');
  assertExactKeys(totals, ['bytes', 'objects', 'roots', 'rootsByProfile']);
  if (!isPlainRecord(totals['rootsByProfile']))
    throw new Error('Media backup profile totals are invalid.');
  const rootsByProfile = totals['rootsByProfile'];
  assertExactKeys(rootsByProfile, [
    'effectBundles',
    'libraryItems',
    'scenarioProjects',
    'videoProjects',
  ]);
  const catalogs = value['catalogs'].map(parseCatalogShard);
  const canonicalCatalogPaths = new Set<string>();
  for (const catalog of catalogs) {
    const canonicalPath = catalog.path.toLocaleLowerCase('en-US');
    if (canonicalCatalogPaths.has(canonicalPath))
      throw new Error('Media backup has duplicate catalogs.');
    canonicalCatalogPaths.add(canonicalPath);
  }
  return {
    archiveId: parseNonEmptyString(value['archiveId'], 'archive ID'),
    catalogs,
    exportedAt: parseNonEmptyString(value['exportedAt'], 'export date'),
    format: MEDIA_HUB_BACKUP_FORMAT,
    ...(value['galleryViews'] === undefined
      ? {}
      : { galleryViews: parsePortableGallerySavedViews(value['galleryViews']) }),
    layout: value['layout'],
    ...(value['layout'] === MEDIA_HUB_BACKUP_SHARED_LAYOUT
      ? { sharedObjects: parseBackupSharedObjects(value['sharedObjects']) }
      : {}),
    privacy: parsePrivacyFlags(value['privacy']),
    totals: {
      bytes: parseSafeInteger(totals['bytes'], 'total bytes'),
      objects: parseSafeInteger(totals['objects'], 'total objects'),
      roots: parseSafeInteger(totals['roots'], 'total roots'),
      rootsByProfile: {
        effectBundles: parseSafeInteger(rootsByProfile['effectBundles'], 'effect bundle count'),
        libraryItems: parseSafeInteger(rootsByProfile['libraryItems'], 'library item count'),
        scenarioProjects: parseSafeInteger(
          rootsByProfile['scenarioProjects'],
          'scenario project count'
        ),
        videoProjects: parseSafeInteger(rootsByProfile['videoProjects'], 'video project count'),
      },
    },
    version: MEDIA_HUB_BACKUP_VERSION,
  };
}
