import type {
  ProjectExportEntry,
  VideoProjectEntry,
} from '../../../composition/persistence/projects/contracts';
import { parseVideoProjectEntry } from '../../../composition/persistence/projects/read-guards';
import { isEffectProjectMetadataBranches } from '../../../features/video/project/validation/effect-instances';
import { readSafeBackupPathSegment, readSafeExportFilename } from './archive-fields';
import { normalizeBlobDescriptor, normalizeRecordingTelemetry } from './blobs';
import { readProjectEntryFields } from './project-entry-fields';
import {
  assertVideoProjectDescriptorReferences,
  assertVideoProjectEffectReferences,
} from './project-references';
import {
  field,
  type JsonRecord,
  readNumber,
  readRecord,
  readRecordArray,
  readString,
} from './readers';
import type {
  ProjectAssetBackupBlobDescriptor,
  EffectProjectBackupDescriptor,
  EffectSnapshotBackupBlobDescriptor,
  EffectSnapshotBackupDescriptor,
  VideoBackupProjectDescriptor,
} from '../contracts/types';
export { normalizeScenarioProject } from './scenario-projects';

function normalizeVideoProjectEntry(value: unknown): VideoProjectEntry {
  const parsed = parseVideoProjectEntry(readProjectEntryFields(value));
  if (!parsed) {
    throw new Error('Invalid video project backup metadata.');
  }
  readSafeBackupPathSegment(parsed.id, 'video project id');
  return parsed;
}

function normalizeProjectAssetBlobDescriptor(
  value: unknown,
  prefixes: readonly string[]
): ProjectAssetBackupBlobDescriptor {
  const descriptor = normalizeBlobDescriptor(value, prefixes);
  const entry = readRecord(descriptor.entry);
  const id = readSafeBackupPathSegment(field(entry, 'id'), 'video project asset id');

  return {
    blobPath: descriptor.blobPath,
    entry: {
      createdAt: readNumber(field(entry, 'createdAt')),
      id,
      mimeType: readString(field(entry, 'mimeType')),
      size: readNumber(field(entry, 'size')),
    },
  };
}

function normalizeProjectExportEntry(value: unknown): ProjectExportEntry {
  const entry = readRecord(value);
  return {
    createdAt: readNumber(field(entry, 'createdAt')),
    duration: readNumber(field(entry, 'duration')),
    filename: readSafeExportFilename(field(entry, 'filename')),
    fps: readNumber(field(entry, 'fps')),
    height: readNumber(field(entry, 'height')),
    id: readSafeBackupPathSegment(field(entry, 'id'), 'video project export id'),
    projectId: readSafeBackupPathSegment(field(entry, 'projectId'), 'video project id'),
    recordingId: readString(field(entry, 'recordingId')),
    size: readNumber(field(entry, 'size')),
    width: readNumber(field(entry, 'width')),
    ...(field(entry, 'format') === undefined ? {} : { format: readString(field(entry, 'format')) }),
    ...(field(entry, 'mimeType') === undefined
      ? {}
      : { mimeType: readString(field(entry, 'mimeType')) }),
  } as ProjectExportEntry;
}

export function normalizeVideoProject(value: JsonRecord): VideoBackupProjectDescriptor {
  const entry = normalizeVideoProjectEntry(field(value, 'entry'));
  const prefix = `video-projects/${entry.id}/`;
  const effectProject =
    field(value, 'effectProject') === undefined
      ? undefined
      : normalizeEffectProjectDescriptor(field(value, 'effectProject'), prefix);
  assertVideoProjectEffectReferences(entry, effectProject);
  const descriptor = {
    entry,
    ...(effectProject ? { effectProject } : {}),
    projectAssets: readRecordArray(field(value, 'projectAssets')).map((descriptor) =>
      normalizeProjectAssetBlobDescriptor(descriptor, [prefix])
    ),
    projectExports: readRecordArray(field(value, 'projectExports')).map((descriptor) => ({
      entry: normalizeProjectExportEntry(field(descriptor, 'entry')),
      recording: normalizeBlobDescriptor(field(descriptor, 'recording'), [prefix]),
      ...(field(descriptor, 'recordingTelemetry') === undefined
        ? {}
        : {
            recordingTelemetry: normalizeRecordingTelemetry(
              field(descriptor, 'recordingTelemetry')
            ),
          }),
      ...(field(descriptor, 'thumbnail') === undefined
        ? {}
        : { thumbnail: normalizeBlobDescriptor(field(descriptor, 'thumbnail'), [prefix]) }),
    })),
    ...(field(value, 'thumbnail') === undefined
      ? {}
      : { thumbnail: normalizeBlobDescriptor(field(value, 'thumbnail'), [prefix]) }),
  };
  assertVideoProjectDescriptorReferences(descriptor);
  return descriptor;
}

function normalizeEffectProjectDescriptor(
  value: unknown,
  projectPrefix: string
): EffectProjectBackupDescriptor {
  const record = readRecord(value);
  const instances = readRecordArray(field(record, 'instances'));
  const snapshots = readRecordArray(field(record, 'snapshots')).map((snapshot) =>
    normalizeEffectSnapshotDescriptor(snapshot, projectPrefix)
  );
  const validationSnapshots = snapshots.map((snapshot) => ({
    ...snapshot,
    assets: snapshot.assets.map(({ entry }) => entry),
  }));
  if (!isEffectProjectMetadataBranches(validationSnapshots, instances)) {
    throw new Error('Invalid EffectV1 project backup metadata.');
  }
  const blobPaths = snapshots.flatMap(({ assets }) => assets.map(({ blobPath }) => blobPath));
  if (new Set(blobPaths).size !== blobPaths.length) {
    throw new Error('Duplicate EffectV1 project backup asset path.');
  }
  return {
    instances: instances as unknown as EffectProjectBackupDescriptor['instances'],
    snapshots,
  };
}

function normalizeEffectSnapshotDescriptor(
  value: JsonRecord,
  projectPrefix: string
): EffectSnapshotBackupDescriptor {
  const assets = readRecordArray(field(value, 'assets')).map((asset) =>
    normalizeEffectSnapshotAssetDescriptor(asset, projectPrefix)
  );
  return {
    assets,
    documentId: readString(field(value, 'documentId')),
    id: readString(field(value, 'id')),
    kind: readString(field(value, 'kind')) as EffectSnapshotBackupDescriptor['kind'],
    retainedByteLength: readNumber(field(value, 'retainedByteLength')),
    schemaVersion: readString(
      field(value, 'schemaVersion')
    ) as EffectSnapshotBackupDescriptor['schemaVersion'],
    sha256: readString(field(value, 'sha256')),
    source: readString(field(value, 'source')),
  };
}

function normalizeEffectSnapshotAssetDescriptor(
  value: JsonRecord,
  projectPrefix: string
): EffectSnapshotBackupBlobDescriptor {
  const entry = readRecord(field(value, 'entry'));
  return {
    blobPath: readSafeEffectBlobPath(field(value, 'blobPath'), projectPrefix),
    entry: {
      byteLength: readNumber(field(entry, 'byteLength')),
      id: readString(field(entry, 'id')),
      kind: readString(field(entry, 'kind')) as EffectSnapshotBackupBlobDescriptor['entry']['kind'],
      mimeType: readString(field(entry, 'mimeType')),
      sha256: readString(field(entry, 'sha256')),
    },
  };
}

function readSafeEffectBlobPath(value: unknown, projectPrefix: string): string {
  const path = readString(value);
  const effectPrefix = `${projectPrefix}effects/`;
  if (
    !path.startsWith(effectPrefix) ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error('Invalid EffectV1 project backup asset path.');
  }
  return path;
}
