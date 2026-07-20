import type {
  MediaAssetKind,
  MediaAssetSource,
  MediaLibraryEntry,
} from '../../../composition/persistence/media-library/contracts';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { normalizeRecordingTelemetry } from './blobs';
import { normalizeScenarioProject, normalizeVideoProject } from './projects';
import {
  failMetadata,
  field,
  type JsonRecord,
  readNullableNumber,
  readNullablePath,
  readNullableString,
  readNumber,
  readRecord,
  readRecordArray,
  readString,
  readStringArray,
} from './readers';
import type { MediaHubBackupAssetDescriptor, MediaHubBackupMetadata } from '../contracts/types';
import { normalizeEffectBundleDescriptor } from './effect-bundles';

const BACKUP_MEDIA_KINDS = new Set<MediaAssetKind>([
  'audio',
  'export',
  'image',
  'recording',
  'screenshot',
  'video',
  'web-archive',
]);

function normalizeMediaSource(value: unknown): MediaAssetSource {
  const source = readRecord(value);
  const kind = readString(field(source, 'kind'));
  if (kind === 'screenshot') {
    return { kind };
  }
  if (kind === 'recording') {
    return { kind, recordingId: readString(field(source, 'recordingId')) };
  }
  if (kind === 'project-export') {
    return {
      exportId: readString(field(source, 'exportId')),
      kind,
      projectId: readString(field(source, 'projectId')),
      recordingId: readString(field(source, 'recordingId')),
    };
  }
  if (kind === 'project-asset') {
    return { kind, projectAssetId: readString(field(source, 'projectAssetId')) };
  }
  if (kind === 'web-snapshot') {
    return { kind, snapshotId: readString(field(source, 'snapshotId')) };
  }

  return failMetadata();
}

function normalizeMediaLibraryEntry(value: unknown): Omit<MediaLibraryEntry, 'blob'> {
  const entry = readRecord(value);
  if ('blob' in entry) {
    failMetadata();
  }

  const kind = readString(field(entry, 'kind')) as MediaAssetKind;
  if (!BACKUP_MEDIA_KINDS.has(kind)) {
    failMetadata();
  }
  const filename = readString(field(entry, 'filename'));
  const originalFilename = readString(field(entry, 'originalFilename'));
  if (
    !isSafeArchiveEntryLeafFilename(filename) ||
    !isSafeArchiveEntryLeafFilename(originalFilename)
  ) {
    failMetadata();
  }

  return {
    createdAt: readNumber(field(entry, 'createdAt')),
    duration: readNullableNumber(field(entry, 'duration')),
    filename,
    height: readNullableNumber(field(entry, 'height')),
    id: readString(field(entry, 'id')),
    kind,
    mimeType: readString(field(entry, 'mimeType')),
    originalFilename,
    size: readNumber(field(entry, 'size')),
    source: normalizeMediaSource(field(entry, 'source')),
    sourceFavicon: sanitizeProvenanceUrl(readNullableString(field(entry, 'sourceFavicon'))),
    sourceTitle: readNullableString(field(entry, 'sourceTitle')),
    sourceUrl: sanitizeProvenanceUrl(readNullableString(field(entry, 'sourceUrl'))),
    tags: readStringArray(field(entry, 'tags')),
    updatedAt: readNumber(field(entry, 'updatedAt')),
    width: readNullableNumber(field(entry, 'width')),
  };
}

function normalizeAssetDescriptor(value: JsonRecord): MediaHubBackupAssetDescriptor {
  return {
    assetPath: readNullablePath(field(value, 'assetPath'), ['assets/']),
    entry: normalizeMediaLibraryEntry(field(value, 'entry')),
    ...(field(value, 'recordingTelemetry') === undefined
      ? {}
      : { recordingTelemetry: normalizeRecordingTelemetry(field(value, 'recordingTelemetry')) }),
    thumbnailPath: readNullablePath(field(value, 'thumbnailPath'), ['thumbnails/']),
  };
}

export function parseBackupMetadata(value: unknown): MediaHubBackupMetadata {
  const metadata = readRecord(value);
  const effectBundles = readRecordArray(field(metadata, 'effectBundles')).map(
    normalizeEffectBundleDescriptor
  );
  if (new Set(effectBundles.map(({ entry }) => entry.packId)).size !== effectBundles.length) {
    failMetadata();
  }
  return {
    assets: readRecordArray(field(metadata, 'assets')).map(normalizeAssetDescriptor),
    effectBundles,
    ...(field(metadata, 'scenarioProjects') === undefined
      ? {}
      : {
          scenarioProjects: readRecordArray(field(metadata, 'scenarioProjects')).map(
            normalizeScenarioProject
          ),
        }),
    ...(field(metadata, 'videoProjects') === undefined
      ? {}
      : {
          videoProjects: readRecordArray(field(metadata, 'videoProjects')).map(
            normalizeVideoProject
          ),
        }),
  };
}
