import { describe, expect, it, vi } from 'vitest';
import {
  putVideoProjectBackupRestore,
  type VideoProjectBackupRestoreStores,
} from './backup-restore';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type { StoredProjectExportEntry } from './contracts';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';

function store(get: (key: IDBValidKey) => unknown = () => undefined) {
  return {
    delete: vi.fn(),
    get: vi.fn(async (key) => get(key)),
    getAll: vi.fn(async () => []),
    put: vi.fn(),
  };
}

function stores(): VideoProjectBackupRestoreStores {
  const exports = { ...store(), index: vi.fn(() => ({ getAll: vi.fn(async () => []) })) };
  const owners = { ...store(), index: vi.fn(() => ({ count: vi.fn(async () => 0) })) };
  return {
    assets: store(),
    exports,
    media: store(),
    operations: store(),
    owners,
    presentations: store(),
    projects: store(),
    refs: store(),
    thumbnails: store(),
  } satisfies VideoProjectBackupRestoreStores;
}

const operation = () => ({
  assetIds: [],
  createdAt: 1,
  kind: 'physical-delete' as const,
  operationId: 'delete',
  status: 'pending' as const,
  updatedAt: 1,
});
const ref = {
  assetId: 'local',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/local' },
  mimeType: 'image/png',
  sha256: null,
  size: 1,
};

describe('video project backup restore adapter', () => {
  it('publishes a prepared project graph through caller-owned stores', async () => {
    const target = stores();
    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [
            {
              entry: {
                assetId: 'local',
                createdAt: 1,
                id: 'project-asset',
                mimeType: 'image/png',
                size: 1,
              },
              filename: 'image.png',
              ref,
            },
          ],
          entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
          exports: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).resolves.toEqual({ conflicted: false, imported: true });
    expect(target.projects.put).toHaveBeenCalled();
    expect(target.refs.put).toHaveBeenCalledWith(ref);
    expect(target.media.put).toHaveBeenCalled();
  });

  it('skips the complete root when a child identity already exists', async () => {
    const target = stores();
    target.assets.get = vi.fn(async () => ({
      assetId: 'other-local',
      createdAt: 1,
      id: 'project-asset',
      mimeType: 'image/png',
      size: 1,
    }));
    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [
            {
              entry: {
                assetId: 'local',
                createdAt: 1,
                id: 'project-asset',
                mimeType: 'image/png',
                size: 1,
              },
              filename: 'image.png',
              ref,
            },
          ],
          entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
          exports: [],
        },
        stores: target,
        strategy: 'skip',
      })
    ).resolves.toEqual({ conflicted: true, imported: false });
    expect(target.projects.put).not.toHaveBeenCalled();
  });

  it('rejects replace when an asset identity belongs to another root', async () => {
    const target = stores();
    target.assets.get = vi.fn(async () => ({
      assetId: 'other-local',
      createdAt: 1,
      id: 'project-asset',
      mimeType: 'image/png',
      size: 1,
    }));
    target.projects.getAll = vi.fn(async () => [
      createVideoProjectEntryWithMediaClip({ id: 'other-project' }),
    ]);

    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [
            {
              entry: {
                assetId: 'local',
                createdAt: 1,
                id: 'project-asset',
                mimeType: 'image/png',
                size: 1,
              },
              filename: 'image.png',
              ref,
            },
          ],
          entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
          exports: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).rejects.toThrow('Video project asset belongs to another root');
  });

  it('rejects a duplicate conflict that changed after preflight', async () => {
    const target = stores();
    target.projects.get = vi.fn(async () =>
      createVideoProjectEntry({ id: 'project' }, { id: 'project' })
    );
    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
          exports: [],
        },
        stores: target,
        strategy: 'duplicate',
      })
    ).rejects.toThrow('conflict changed after preflight');
  });

  it('replaces the complete existing graph and records unowned bytes for deletion', async () => {
    const target = stores();
    const existing = createVideoProjectEntryWithMediaClip({ id: 'project' });
    const existingExport = {
      assetId: 'export-object',
      createdAt: 1,
      duration: 1,
      filename: 'old.webm',
      fps: 30,
      height: 100,
      id: 'old-export',
      mimeType: 'video/webm',
      projectId: 'project',
      size: 4,
      width: 100,
    } satisfies StoredProjectExportEntry;
    target.projects.get = vi.fn(async () => existing);
    target.projects.getAll = vi.fn(async () => [existing]);
    target.assets.get = vi.fn(async () => ({
      assetId: 'asset-object',
      createdAt: 1,
      id: 'project-asset-1',
      mimeType: 'video/webm',
      size: 4,
    }));
    target.exports.index = vi.fn(() => ({ getAll: vi.fn(async () => [existingExport]) }));
    const pendingDelete = operation();

    await expect(
      putVideoProjectBackupRestore({
        operation: pendingDelete,
        root: {
          assets: [],
          entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
          exports: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).resolves.toEqual({ conflicted: true, imported: true });

    expect(target.assets.delete).toHaveBeenCalledWith('project-asset-1');
    expect(target.exports.delete).toHaveBeenCalledWith('old-export');
    expect(target.projects.delete).toHaveBeenCalledWith('project');
    expect(pendingDelete.assetIds).toEqual(['asset-object', 'export-object']);
  });

  it('publishes export and project presentation sidecars', async () => {
    const target = stores();
    const thumbnail = {
      assetId: 'export:export',
      blob: new Blob(['thumb']),
      createdAt: 1,
      height: 1,
      updatedAt: 1,
      width: 1,
    } satisfies MediaThumbnailEntry;
    const presentation = {
      aggregateId: 'project',
      aggregateKind: 'video-project' as const,
      presentationRevision: 1,
      thumbnailBlob: new Blob(['presentation']),
      updatedAt: 1,
    } satisfies AggregatePresentationEntry;
    const exportEntry = {
      assetId: 'local',
      createdAt: 1,
      duration: 1,
      filename: 'export.webm',
      fps: 30,
      height: 100,
      id: 'export',
      mimeType: 'video/webm',
      projectId: 'project',
      size: 1,
      width: 100,
    } satisfies StoredProjectExportEntry;

    await putVideoProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [{ entry: exportEntry, ref, thumbnail }],
        presentation,
        thumbnail,
      },
      stores: target,
      strategy: 'replace',
    });

    expect(target.exports.put).toHaveBeenCalledWith(exportEntry);
    expect(target.thumbnails.put).toHaveBeenCalledWith(thumbnail);
    expect(target.presentations.put).toHaveBeenCalledWith(presentation);
  });
});
