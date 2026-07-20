import type {
  ScenarioExportEntry,
  ScenarioProjectEntry,
  ScenarioStepEditorDocumentEntry,
} from '../../../composition/persistence/scenario/contracts';
import { parseScenarioProjectEntry } from '../../../composition/persistence/scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../../../composition/persistence/scenario/editor-documents';
import { isSafeScenarioAssetImageMimeType } from '../../../composition/persistence/scenario/projects/guards';
import { readSafeBackupPathSegment, readSafeExportFilename } from './archive-fields';
import { readProjectEntryFields } from './project-entry-fields';
import { assertScenarioProjectDescriptorReferences } from './project-references';
import { assertScenarioExportThumbnailOwnership } from './scenario-export-thumbnails';
import { assertSupportedScenarioBackupProjectEntry } from './scenario-project-version';
import {
  failMetadata,
  field,
  type JsonRecord,
  readNumber,
  readRecord,
  readRecordArray,
  readString,
} from './readers';
import { normalizeBlobDescriptor } from './blobs';
import type { BackupBlobDescriptor, ScenarioBackupProjectDescriptor } from '../contracts/types';

function readBackupBlobDescriptorId(entry: BackupBlobDescriptor['entry']): string {
  if ('id' in entry && typeof entry.id === 'string') {
    return entry.id;
  }
  if ('assetId' in entry && typeof entry.assetId === 'string') {
    return entry.assetId;
  }
  throw new Error('Invalid backup blob descriptor id.');
}

function normalizeScenarioAssetBlobDescriptor(
  value: unknown,
  prefixes: readonly string[]
): BackupBlobDescriptor {
  const descriptor = normalizeBlobDescriptor(value, prefixes);
  readSafeBackupPathSegment(readBackupBlobDescriptorId(descriptor.entry), 'scenario asset id');
  const entry = readRecord(descriptor.entry);
  if (!isSafeScenarioAssetImageMimeType(readString(field(entry, 'mimeType')))) {
    throw new Error('Unsupported scenario asset MIME type.');
  }
  return descriptor;
}

function normalizeScenarioProjectEntry(value: unknown): ScenarioProjectEntry {
  const parsed = parseScenarioProjectEntry(readProjectEntryFields(value));
  if (!parsed) {
    throw new Error('Invalid scenario project backup metadata.');
  }
  assertSupportedScenarioBackupProjectEntry(parsed);
  readSafeBackupPathSegment(parsed.id, 'scenario project id');
  return parsed;
}

function normalizeScenarioExportEntry(value: unknown): ScenarioExportEntry {
  const entry = readRecord(value);
  return {
    createdAt: readNumber(field(entry, 'createdAt')),
    filename: readSafeExportFilename(field(entry, 'filename')),
    format: readString(field(entry, 'format')) as ScenarioExportEntry['format'],
    id: readSafeBackupPathSegment(field(entry, 'id'), 'scenario export id'),
    projectId: readSafeBackupPathSegment(field(entry, 'projectId'), 'scenario project id'),
    size: readNumber(field(entry, 'size')),
  };
}

function normalizeStepDocument(value: unknown): ScenarioStepEditorDocumentEntry {
  const entry = readRecord(value);
  const parsed = parseScenarioStepEditorDocumentEntry({
    createdAt: readNumber(field(entry, 'createdAt')),
    document: field(entry, 'document'),
    projectId: readSafeBackupPathSegment(field(entry, 'projectId'), 'scenario project id'),
    stepId: readSafeBackupPathSegment(field(entry, 'stepId'), 'scenario step document id'),
    updatedAt: readNumber(field(entry, 'updatedAt')),
  });
  if (!parsed) {
    failMetadata();
  }
  return parsed;
}

export function normalizeScenarioProject(value: JsonRecord): ScenarioBackupProjectDescriptor {
  const entry = normalizeScenarioProjectEntry(field(value, 'entry'));
  const prefix = `scenario-projects/${entry.id}/`;
  const descriptor = {
    assets: readRecordArray(field(value, 'assets')).map((descriptor) =>
      normalizeScenarioAssetBlobDescriptor(descriptor, [prefix])
    ),
    entry,
    exports: readRecordArray(field(value, 'exports')).map(normalizeScenarioExportEntry),
    stepDocuments: readRecordArray(field(value, 'stepDocuments')).map(normalizeStepDocument),
    ...(field(value, 'thumbnail') === undefined
      ? {}
      : { thumbnail: normalizeBlobDescriptor(field(value, 'thumbnail'), [prefix]) }),
    ...(field(value, 'exportThumbnails') === undefined
      ? {}
      : {
          exportThumbnails: readRecordArray(field(value, 'exportThumbnails')).map((descriptor) =>
            normalizeBlobDescriptor(descriptor, [prefix])
          ),
        }),
  };
  assertScenarioExportThumbnailOwnership(descriptor);
  assertScenarioProjectDescriptorReferences(descriptor);
  return descriptor;
}
