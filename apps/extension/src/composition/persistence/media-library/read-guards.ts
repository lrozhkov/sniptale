import type {
  MediaAssetKind,
  MediaAssetSource,
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from './contracts';

type MediaLibraryEntryFields = Omit<MediaLibraryEntry, 'kind' | 'source'>;

const MEDIA_ASSET_KINDS: ReadonlySet<MediaAssetKind> = new Set([
  'screenshot',
  'recording',
  'export',
  'audio',
  'image',
  'video',
  'web-archive',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalBlob(value: unknown): value is Blob | undefined {
  return value === undefined || value instanceof Blob;
}

function parseMediaAssetKind(value: unknown): MediaAssetKind | null {
  switch (value) {
    case 'screenshot':
    case 'recording':
    case 'export':
    case 'audio':
    case 'image':
    case 'video':
    case 'web-archive':
      return value;
    default:
      return null;
  }
}

function parseMediaAssetSource(value: unknown): MediaAssetSource | null {
  if (!isRecord(value) || !isString(value['kind'])) {
    return null;
  }

  switch (value['kind']) {
    case 'screenshot':
      return { kind: 'screenshot' };
    case 'recording':
      return isString(value['recordingId'])
        ? { kind: 'recording', recordingId: value['recordingId'] }
        : null;
    case 'project-export':
      return isString(value['exportId']) &&
        isString(value['projectId']) &&
        isString(value['recordingId'])
        ? {
            exportId: value['exportId'],
            kind: 'project-export',
            projectId: value['projectId'],
            recordingId: value['recordingId'],
          }
        : null;
    case 'project-asset':
      return isString(value['projectAssetId'])
        ? { kind: 'project-asset', projectAssetId: value['projectAssetId'] }
        : null;
    case 'web-snapshot':
      return isString(value['snapshotId'])
        ? { kind: 'web-snapshot', snapshotId: value['snapshotId'] }
        : null;
    default:
      return null;
  }
}

function hasMediaLibraryEntryFields(
  value: Record<string, unknown>
): value is MediaLibraryEntryFields {
  return (
    isString(value['id']) &&
    isString(value['filename']) &&
    isString(value['originalFilename']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt']) &&
    isNumber(value['size']) &&
    isString(value['mimeType']) &&
    isNullableNumber(value['width']) &&
    isNullableNumber(value['height']) &&
    isNullableNumber(value['duration']) &&
    isNullableString(value['sourceUrl']) &&
    isNullableString(value['sourceTitle']) &&
    isNullableString(value['sourceFavicon']) &&
    isStringArray(value['tags']) &&
    isOptionalBlob(value['blob'])
  );
}

export function parseMediaLibraryEntry(value: unknown): MediaLibraryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = parseMediaAssetKind(value['kind']);
  const source = parseMediaAssetSource(value['source']);
  if (!kind || !MEDIA_ASSET_KINDS.has(kind) || !source) {
    return null;
  }

  if (!hasMediaLibraryEntryFields(value)) {
    return null;
  }

  return {
    createdAt: value['createdAt'],
    duration: value['duration'],
    filename: value['filename'],
    height: value['height'],
    id: value['id'],
    kind,
    mimeType: value['mimeType'],
    originalFilename: value['originalFilename'],
    size: value['size'],
    source,
    sourceFavicon: value['sourceFavicon'],
    sourceTitle: value['sourceTitle'],
    sourceUrl: value['sourceUrl'],
    tags: value['tags'],
    updatedAt: value['updatedAt'],
    width: value['width'],
    ...(value['blob'] === undefined ? {} : { blob: value['blob'] }),
  };
}

export function parseMediaThumbnailEntry(value: unknown): MediaThumbnailEntry | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value['assetId']) ||
    !(value['blob'] instanceof Blob) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt']) ||
    !isNumber(value['width']) ||
    !isNumber(value['height'])
  ) {
    return null;
  }
  return {
    assetId: value['assetId'],
    blob: value['blob'],
    createdAt: value['createdAt'],
    height: value['height'],
    updatedAt: value['updatedAt'],
    width: value['width'],
  };
}
