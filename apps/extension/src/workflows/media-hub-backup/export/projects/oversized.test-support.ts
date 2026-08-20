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
      if (storeName === 'asset_refs' && key === 'asset-project-1') {
        const blob = createOversizedBackupBlob();
        return {
          assetId: 'asset-project-1',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/asset-project-1' },
          mimeType: 'image/png',
          sha256: null,
          size: blob.size,
        };
      }
      return undefined;
    },
    projectAssetIds: ['asset-1'],
    projectExports: [],
  });
}

export function createOversizedVideoProjectExportBundleDb() {
  const blob = createOversizedBackupBlob();
  return createVideoProjectBundleDb({
    getRecord: async (storeName, key) => {
      if (storeName === 'asset_refs' && key === 'asset-export-1') {
        return {
          assetId: 'asset-export-1',
          createdAt: 2,
          location: { kind: 'opfs', objectKey: 'objects/asset-export-1' },
          mimeType: 'video/webm',
          sha256: null,
          size: blob.size,
        };
      }
      return undefined;
    },
    projectAssetIds: [],
    projectExports: [createProjectExportRecord('export-1', 'asset-export-1')],
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

function createProjectExportRecord(id: string, assetId: string) {
  return {
    assetId,
    createdAt: 4,
    duration: 1,
    filename: `${id}.webm`,
    fps: 30,
    height: 100,
    id,
    mimeType: 'video/webm',
    projectId: 'video-project-1',
    size: 8,
    width: 100,
  };
}

function createOversizedBackupBlob(): Blob {
  return createSizedBackupTestBlob(MAX_BACKUP_ENTRY_BYTES + 1);
}

function createProjectAssetRecord(blob: Blob) {
  return {
    assetId: 'asset-project-1',
    id: 'asset-1',
    createdAt: 1,
    mimeType: 'image/png',
    size: blob.size,
  };
}
