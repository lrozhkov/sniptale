import { vi } from 'vitest';
import { createSizedBackupTestBlob } from '../blob/budget.test-support.ts';
import { MAX_BACKUP_ENTRY_BYTES } from '../../manifest';
import { createVideoProjectFixture } from './video-fixture.test-support.ts';

export function createOversizedVideoProjectAssetBundleDb() {
  return createVideoProjectBundleDb({
    getRecord: async (storeName, key) => {
      if (storeName === 'project_assets' && key === 'asset-1') {
        return createProjectAssetRecord(createOversizedBackupBlob());
      }
      return undefined;
    },
    projectAssetIds: ['asset-1'],
    projectExports: [],
  });
}

export function createOversizedVideoProjectExportBundleDb() {
  return createVideoProjectBundleDb({
    getRecord: async (storeName, key) => {
      if (storeName === 'recordings' && key === 'recording-1') {
        return createRecordingRecord(createOversizedBackupBlob());
      }
      return undefined;
    },
    projectAssetIds: [],
    projectExports: [createProjectExportRecord('export-1', 'recording-1')],
  });
}

function createVideoProjectBundleDb(args: {
  getRecord: (storeName: string, key: string) => Promise<unknown>;
  projectAssetIds: string[];
  projectExports: ReturnType<typeof createProjectExportRecord>[];
}) {
  return {
    get: vi.fn(args.getRecord),
    getAll: vi.fn(async (storeName: string) => {
      if (storeName !== 'video_projects') {
        return [];
      }
      return [createVideoProjectEntry(args.projectAssetIds)];
    }),
    getAllFromIndex: vi.fn(async (storeName: string) =>
      storeName === 'project_exports' ? args.projectExports : []
    ),
  };
}

function createVideoProjectEntry(projectAssetIds: string[]) {
  return {
    id: 'video-project-1',
    project: createVideoProjectFixture(
      'video-project-1',
      projectAssetIds.map((projectAssetId) => ({
        source: { kind: 'project-asset' as const, projectAssetId },
      }))
    ),
    createdAt: 1,
    updatedAt: 2,
  };
}

function createProjectExportRecord(id: string, recordingId: string) {
  return {
    createdAt: 4,
    duration: 1,
    filename: `${id}.webm`,
    fps: 30,
    height: 100,
    id,
    projectId: 'video-project-1',
    recordingId,
    size: 8,
    width: 100,
  };
}

function createOversizedBackupBlob(): Blob {
  return createSizedBackupTestBlob(MAX_BACKUP_ENTRY_BYTES + 1);
}

function createProjectAssetRecord(blob: Blob) {
  return {
    id: 'asset-1',
    blob,
    createdAt: 1,
    mimeType: 'image/png',
    size: blob.size,
  };
}

function createRecordingRecord(blob: Blob) {
  return {
    id: 'recording-1',
    blob,
    filename: 'export.webm',
    createdAt: 2,
    size: blob.size,
  };
}
