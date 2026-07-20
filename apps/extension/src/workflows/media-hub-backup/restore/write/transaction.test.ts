import { expect, it } from 'vitest';

import {
  assertBackupImportWritePreflightComplete,
  getImportTransactionStoreNames,
} from './transaction';
import type { PreparedBackupImportAsset } from '../prepare';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';

function createMediaEntry(): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 720,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 12,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 11,
    width: 1280,
  };
}

function createPreparedAsset(
  overrides: Partial<PreparedBackupImportAsset> = {}
): PreparedBackupImportAsset {
  return {
    assetBlob: new Blob(['asset']),
    assetPath: 'assets/asset-1',
    existingEntry: undefined,
    nextEntry: createMediaEntry(),
    recordingTelemetry: null,
    thumbnailBlob: null,
    thumbnailPath: null,
    webSnapshotRecord: null,
    ...overrides,
  };
}

it('returns the complete store list needed for import transactions', () => {
  expect(getImportTransactionStoreNames()).toEqual([
    'recordings',
    'recording_telemetry',
    'project_assets',
    'project_exports',
    'video_projects',
    'video_effect_bundles',
    'scenario_projects',
    'scenario_assets',
    'scenario_exports',
    'scenario_step_editor_documents',
    'web_snapshots',
    'media_library',
    'thumbnails',
  ]);
});

it('accepts prepared import assets only after blob and next-entry preflight', () => {
  expect(() => assertBackupImportWritePreflightComplete([createPreparedAsset()])).not.toThrow();
});

it.each([
  ['malformed missing asset blob', { assetBlob: null as never }],
  ['malformed missing next entry', { nextEntry: null as never }],
])('rejects prepared import assets with %s', (_label, prepared) => {
  expect(() => assertBackupImportWritePreflightComplete([createPreparedAsset(prepared)])).toThrow(
    'Backup import write preflight is incomplete.'
  );
});
