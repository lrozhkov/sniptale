import {
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
  assertSafeArchivePath,
  type ArchiveObjectRef,
  type ArchiveRootDescriptor,
} from '../../../composition/archive-transfer';
import {
  MAX_ROOT_METADATA_BYTES,
  MEDIA_HUB_BACKUP_FORMAT,
  MEDIA_HUB_BACKUP_VERSION,
  type JsonValue,
  type MediaHubBackupCatalogShard,
  type MediaHubBackupManifestV6,
  type MediaHubBackupPrivacyFlags,
  type MediaHubBackupRootEnvelope,
} from './contracts';
import { assertV6CatalogPath, assertV6ObjectPath, MEDIA_HUB_BACKUP_LAYOUT } from './layout';
import { parsePortableGallerySavedViews } from '../../../composition/persistence/gallery-saved-views';

const PORTABLE_URL_PATTERN = /^(?:data|blob):/i;
const BINARY_BASE64_SIGNATURE_PATTERN =
  /^(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR|AAAAIGZ0eXB|JVBERi0|UEsDB|GkXf|T2dnUw|SUQz|Qk)/u;
const LONG_EXPLICIT_BASE64_PATTERN = /^(?=.{64,}$)(?=.*[+/=])[A-Za-z0-9+/]+={0,2}$/u;
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_STRING_LENGTH = 1024 * 1024;

function normalizeUrlSchemeCandidate(value: string): string {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    normalized += value[index];
  }
  let start = 0;
  while (start < normalized.length && normalized.charCodeAt(start) <= 0x20) start += 1;
  return normalized.slice(start);
}

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

export function parseArchiveRootDescriptor(value: unknown): ArchiveRootDescriptor {
  if (!isPlainRecord(value)) throw new Error('Media backup root descriptor is invalid.');
  const rootKind = value['rootKind'];
  const media = rootKind === 'media';
  assertExactKeys(
    value,
    ['rootKind', 'rootId', 'metadataPath', 'objectCount', 'totalBytes'],
    media ? ['mediaSubtype'] : []
  );
  const rootId = parseNonEmptyString(value['rootId'], 'root ID');
  const metadataPath = parseNonEmptyString(value['metadataPath'], 'metadata path');
  assertSafeArchivePath(metadataPath);
  const objectCount = parseSafeInteger(value['objectCount'], 'object count');
  const totalBytes = parseSafeInteger(value['totalBytes'], 'byte total');
  if (objectCount > MAX_MEDIA_ARCHIVE_ENTRIES || totalBytes > MAX_MEDIA_ARCHIVE_INFLATED_BYTES) {
    throw new Error('Media backup root exceeds its resource profile.');
  }
  if (rootKind === 'media') {
    const mediaSubtype = value['mediaSubtype'];
    if (mediaSubtype !== 'library-item' && mediaSubtype !== 'effect-bundle') {
      throw new Error('Media backup media subtype is invalid.');
    }
    return { mediaSubtype, metadataPath, objectCount, rootId, rootKind, totalBytes };
  }
  if (rootKind !== 'video-project' && rootKind !== 'scenario-project') {
    throw new Error('Media backup root kind is invalid.');
  }
  return { metadataPath, objectCount, rootId, rootKind, totalBytes };
}

function parseArchiveObjectRef(value: unknown): ArchiveObjectRef {
  if (!isPlainRecord(value)) throw new Error('Media backup object reference is invalid.');
  assertExactKeys(value, ['objectId', 'path', 'filename', 'mimeType', 'size']);
  const objectId = parseNonEmptyString(value['objectId'], 'object ID');
  const path = parseNonEmptyString(value['path'], 'object path');
  const filename = parseNonEmptyString(value['filename'], 'object filename');
  const mimeType = parseNonEmptyString(value['mimeType'], 'object MIME type');
  const size = parseSafeInteger(value['size'], 'object size');
  assertV6ObjectPath(path, objectId, filename);
  if (!MIME_TYPE_PATTERN.test(mimeType)) {
    throw new Error('Media backup object MIME type is invalid.');
  }
  return { filename, mimeType, objectId, path, size };
}

export function assertPortableJson(value: unknown, depth = 0): asserts value is JsonValue {
  if (depth > MAX_JSON_DEPTH) throw new Error('Media backup metadata nesting is too deep.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Media backup metadata contains a non-finite number.');
    return;
  }
  if (typeof value === 'string') {
    const urlSchemeCandidate = normalizeUrlSchemeCandidate(value);
    if (
      value.length > MAX_JSON_STRING_LENGTH ||
      PORTABLE_URL_PATTERN.test(urlSchemeCandidate) ||
      BINARY_BASE64_SIGNATURE_PATTERN.test(value) ||
      LONG_EXPLICIT_BASE64_PATTERN.test(value)
    ) {
      throw new Error('Media backup metadata contains embedded binary data.');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPortableJson(item, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) throw new Error('Media backup metadata is not portable JSON.');
  for (const [key, item] of Object.entries(value)) {
    if (key.toLocaleLowerCase('en-US') === 'assetid') {
      throw new Error('Media backup metadata contains a local asset ID.');
    }
    assertPortableJson(item, depth + 1);
  }
}

export function parseRootEnvelope(value: unknown): MediaHubBackupRootEnvelope {
  if (!isPlainRecord(value)) throw new Error('Media backup root metadata is invalid.');
  assertExactKeys(value, ['descriptor', 'metadata', 'objects']);
  const descriptor = parseArchiveRootDescriptor(value['descriptor']);
  assertPortableJson(value['metadata']);
  if (!Array.isArray(value['objects'])) throw new Error('Media backup object list is invalid.');
  const objects = value['objects'].map(parseArchiveObjectRef);
  const objectPaths = new Set<string>();
  const objectIds = new Set<string>();
  let totalBytes = 0;
  for (const object of objects) {
    const canonicalPath = object.path.toLocaleLowerCase('en-US');
    if (objectPaths.has(canonicalPath) || objectIds.has(object.objectId)) {
      throw new Error('Media backup root contains duplicate objects.');
    }
    objectPaths.add(canonicalPath);
    objectIds.add(object.objectId);
    totalBytes += object.size;
  }
  if (objects.length !== descriptor.objectCount || totalBytes !== descriptor.totalBytes) {
    throw new Error('Media backup root object totals do not match its descriptor.');
  }
  return { descriptor, metadata: value['metadata'], objects };
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

export function parseManifestV6(value: unknown): MediaHubBackupManifestV6 {
  if (!isPlainRecord(value)) throw new Error('Media backup manifest is invalid.');
  if (
    value['format'] === MEDIA_HUB_BACKUP_FORMAT &&
    value['version'] === MEDIA_HUB_BACKUP_VERSION &&
    value['layout'] !== MEDIA_HUB_BACKUP_LAYOUT
  ) {
    throw new Error('Unsupported media backup v6 layout. Create a new backup with this version.');
  }
  assertExactKeys(
    value,
    ['archiveId', 'catalogs', 'exportedAt', 'format', 'layout', 'privacy', 'totals', 'version'],
    ['galleryViews']
  );
  if (
    value['format'] !== MEDIA_HUB_BACKUP_FORMAT ||
    value['version'] !== MEDIA_HUB_BACKUP_VERSION ||
    value['layout'] !== MEDIA_HUB_BACKUP_LAYOUT
  ) {
    throw new Error('Unsupported media backup format.');
  }
  if (!Array.isArray(value['catalogs']) || !isPlainRecord(value['totals'])) {
    throw new Error('Media backup manifest totals are invalid.');
  }
  const totals = value['totals'];
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
    layout: MEDIA_HUB_BACKUP_LAYOUT,
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

export function parseBoundedJson(text: string, maxBytes = MAX_ROOT_METADATA_BYTES): unknown {
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error('Media backup JSON exceeds its byte budget.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Media backup JSON is malformed.', { cause: error });
  }
}
