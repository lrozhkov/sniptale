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
import { tryNormalizeAggregatePresentation } from './presentation';
import { parseImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces/parser';
import type { ImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces/contracts';
import { parseLibraryLifecycle } from '../../../composition/persistence/library-lifecycle/parser';

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

  const updatedAt = readNumber(field(entry, 'updatedAt'));
  const lifecycle = parseLibraryLifecycle(field(entry, 'lifecycle'), {
    storageClass: 'library',
    updatedAt,
  });
  if (!lifecycle) failMetadata();
  const workspaceRevisionValue = field(entry, 'workspaceRevision');
  const workspaceRevision =
    workspaceRevisionValue === undefined ? 0 : readNumber(workspaceRevisionValue);
  if (!Number.isInteger(workspaceRevision) || workspaceRevision < 0) failMetadata();
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
    updatedAt,
    width: readNullableNumber(field(entry, 'width')),
    workspaceRevision,
    lifecycle: { ...lifecycle, storageClass: 'library', savedAt: lifecycle.savedAt ?? updatedAt },
  };
}

function normalizeImageWorkspace(value: unknown): ImageWorkspaceEntry {
  const parsed = parseImageWorkspaceEntry(value);
  return parsed ?? failMetadata();
}

function normalizeAssetDescriptor(value: JsonRecord): MediaHubBackupAssetDescriptor {
  const entry = normalizeMediaLibraryEntry(field(value, 'entry'));
  const workspace =
    field(value, 'workspace') === undefined
      ? undefined
      : normalizeImageWorkspace(field(value, 'workspace'));
  const workspaceRevision = entry.workspaceRevision ?? 0;
  const isEditableImage =
    entry.source.kind === 'screenshot' && (entry.kind === 'image' || entry.kind === 'screenshot');
  if (
    (!isEditableImage && (workspaceRevision !== 0 || workspace !== undefined)) ||
    (workspace !== undefined &&
      (workspace.aggregateId !== entry.id || workspace.revision !== workspaceRevision)) ||
    (isEditableImage && workspaceRevision > 0 && workspace === undefined)
  ) {
    failMetadata();
  }
  const presentation =
    field(value, 'presentation') === undefined
      ? undefined
      : tryNormalizeAggregatePresentation(field(value, 'presentation'));
  return {
    assetPath: readNullablePath(field(value, 'assetPath'), ['assets/']),
    entry,
    ...(field(value, 'recordingTelemetry') === undefined
      ? {}
      : { recordingTelemetry: normalizeRecordingTelemetry(field(value, 'recordingTelemetry')) }),
    thumbnailPath: readNullablePath(field(value, 'thumbnailPath'), ['thumbnails/']),
    ...(workspace ? { workspace } : {}),
    ...(presentation ? { presentation } : {}),
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
