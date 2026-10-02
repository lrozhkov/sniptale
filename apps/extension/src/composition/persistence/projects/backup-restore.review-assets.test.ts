import { createVideoProjectRestoreTransaction } from './index.test-support';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import {
  putVideoProjectBackupRestore,
  type VideoProjectBackupRestoreStores,
} from './backup-restore';
import type { StoredProjectExportEntry } from './contracts';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';

function store() {
  return { delete: vi.fn(), get: vi.fn(), getAll: vi.fn(async () => []), put: vi.fn() };
}

function stores(): VideoProjectBackupRestoreStores {
  return {
    assets: store(),
    exports: { ...store(), index: vi.fn(() => ({ getAll: vi.fn(async () => []) })) },
    media: store(),
    videoWorkspaces: store(),
    videoDrafts: store(),
    operations: store(),
    owners: { ...store(), index: vi.fn(() => ({ count: vi.fn(async () => 0) })) },
    presentations: store(),
    projects: store(),
    refs: store(),
    thumbnails: store(),
    scenarioAssets: store(),
  } satisfies VideoProjectBackupRestoreStores;
}

function reviewWorkspace(aggregateId: string, projectAssetId: string): VideoWorkspace {
  const advanced = createQuickEditAdvancedState();
  return {
    aggregateId,
    formatVersion: 1,
    source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
    sourceAssetId: 'source-object',
    revision: 1,
    history: [],
    cursor: 0,
    advanced: {
      ...advanced,
      audio: {
        ...advanced.audio,
        music: [
          {
            id: `music-${projectAssetId}`,
            assetId: `project-asset:${projectAssetId}`,
            timelineStart: 0,
            sourceOffset: 0,
            duration: 1,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function physicalDeleteOperation() {
  return {
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete' as const,
    operationId: 'delete',
    status: 'pending' as const,
    updatedAt: 1,
  };
}

function sharedSourceStores() {
  const target = stores();
  const projectA = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const projectB = createVideoProjectEntryWithMediaClip({ id: 'other-project' });
  target.projects.get = vi.fn(async () => projectA);
  target.projects.getAll = vi.fn(async () => [projectA, projectB]);
  target.videoWorkspaces.getAll = vi.fn(async () => [
    reviewWorkspace('project-asset:project-asset-1', 'shared-review-child'),
  ]);
  target.assets.get = vi.fn(async (key) => {
    const id = String(key);
    if (!['project-asset-1', 'shared-review-child'].includes(id)) return undefined;
    return { assetId: `${id}-object`, createdAt: 1, id, mimeType: 'audio/mpeg', size: 4 };
  });
  return target;
}

it('reclaims three levels of private review resources during archive replacement', async () => {
  const target = stores();
  const existing = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const ids = ['project-asset-1', 'child', 'grandchild'];
  const reviews = new Map([
    ['project-asset:project-asset-1', reviewWorkspace('project-asset:project-asset-1', 'child')],
    ['project-asset:child', reviewWorkspace('project-asset:child', 'grandchild')],
  ]);
  let current = existing;
  target.projects.get = vi.fn(async () => current);
  target.projects.getAll = vi.fn(async () => [current]);
  target.projects.put = vi.fn(async (value) => {
    current = value;
  });
  target.videoWorkspaces.get = vi.fn(async (key) => reviews.get(String(key)));
  target.videoWorkspaces.getAll = vi.fn(async () => [...reviews.values()]);
  target.videoWorkspaces.delete = vi.fn(async (key) => reviews.delete(String(key)));
  target.assets.get = vi.fn(async (key) =>
    ids.includes(String(key))
      ? {
          id: String(key),
          assetId: `object-${String(key)}`,
          createdAt: 1,
          mimeType: 'audio/mpeg',
          size: 4,
        }
      : undefined
  );
  const operation = physicalDeleteOperation();
  await putVideoProjectBackupRestore({
    operation,
    root: {
      assets: [],
      entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
      exports: [],
    },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  for (const id of ids) expect(target.assets.delete).toHaveBeenCalledWith(id);
  expect(reviews.size).toBe(0);
  expect(operation.assetIds).toEqual(expect.arrayContaining(ids.map((id) => `object-${id}`)));
});

it('replaces review-only children and protects assets referenced by another workspace', async () => {
  const target = stores();
  const existing = createVideoProjectEntryWithMediaClip({ id: 'project' });
  target.projects.get = vi.fn(async () => existing);
  target.projects.getAll = vi.fn(async () => [existing]);
  target.videoWorkspaces.getAll = vi.fn(async () => [
    reviewWorkspace('project-asset:project-asset-1', 'review-exclusive'),
    reviewWorkspace('export:old-export', 'review-shared'),
    reviewWorkspace('recording:other', 'review-shared'),
  ]);
  target.exports.index = vi.fn(() => ({
    getAll: vi.fn(async () => [
      {
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
      } satisfies StoredProjectExportEntry,
    ]),
  }));
  target.assets.get = vi.fn(async (key) => {
    const id = String(key);
    if (!['project-asset-1', 'review-exclusive', 'review-shared'].includes(id)) return undefined;
    return { assetId: `${id}-object`, createdAt: 1, id, mimeType: 'audio/mpeg', size: 4 };
  });
  target.exports.get = vi.fn(async (key) =>
    (await target.exports.index('projectId').getAll('project')).find(
      (row) => typeof row === 'object' && row !== null && 'id' in row && row.id === key
    )
  );
  target.projects.put = vi.fn(async (value) => {
    vi.mocked(target.projects.getAll).mockResolvedValue([value]);
  });
  const operation = physicalDeleteOperation();

  await expect(
    putVideoProjectBackupRestore({
      operation,
      root: {
        assets: [
          {
            entry: {
              assetId: 'new-review-object',
              createdAt: 2,
              id: 'review-exclusive',
              mimeType: 'audio/mpeg',
              size: 5,
            },
            filename: 'music.mp3',
            ref: {
              assetId: 'new-review-object',
              createdAt: 2,
              location: { kind: 'opfs', objectKey: 'objects/new-review-object' },
              mimeType: 'audio/mpeg',
              sha256: null,
              size: 5,
            },
          },
        ],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).resolves.toEqual({ conflicted: true, imported: true });

  expect(target.assets.delete).toHaveBeenCalledWith('review-exclusive');
  expect(target.assets.delete).not.toHaveBeenCalledWith('review-shared');
  expect(target.media.delete).toHaveBeenCalledWith('project-asset:review-exclusive');
  expect(operation.assetIds).toContain('review-exclusive-object');
});

it('retains review children reached through a source shared with another project', async () => {
  const target = sharedSourceStores();
  const operation = physicalDeleteOperation();

  await expect(
    putVideoProjectBackupRestore({
      operation,
      root: {
        assets: [],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).resolves.toEqual({ conflicted: true, imported: true });

  expect(target.assets.delete).not.toHaveBeenCalledWith('project-asset-1');
  expect(target.assets.delete).not.toHaveBeenCalledWith('shared-review-child');
  expect(target.media.delete).not.toHaveBeenCalledWith('project-asset:project-asset-1');
  expect(target.media.delete).not.toHaveBeenCalledWith('project-asset:shared-review-child');
  expect(target.videoWorkspaces.delete).not.toHaveBeenCalledWith('project-asset:project-asset-1');
  expect(target.videoWorkspaces.delete).not.toHaveBeenCalledWith(
    'project-asset:shared-review-child'
  );
  expect(operation.assetIds).not.toContain('project-asset-1-object');
  expect(operation.assetIds).not.toContain('shared-review-child-object');
});

it('denies hostile replacement of a review child reached through a shared source', async () => {
  const target = sharedSourceStores();

  await expect(
    putVideoProjectBackupRestore({
      operation: physicalDeleteOperation(),
      root: {
        assets: [
          {
            entry: {
              assetId: 'hostile-object',
              createdAt: 2,
              id: 'shared-review-child',
              mimeType: 'audio/mpeg',
              size: 5,
            },
            filename: 'hostile.mp3',
            ref: {
              assetId: 'hostile-object',
              createdAt: 2,
              location: { kind: 'opfs', objectKey: 'objects/hostile-object' },
              mimeType: 'audio/mpeg',
              sha256: null,
              size: 5,
            },
          },
        ],
        entry: createVideoProjectEntry({ id: 'project' }, { id: 'project' }),
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).rejects.toThrow('Video project asset belongs to another root: shared-review-child');

  expect(target.projects.delete).not.toHaveBeenCalled();
  expect(target.assets.delete).not.toHaveBeenCalled();
  expect(target.media.delete).not.toHaveBeenCalled();
});

it.each(['video', 'review'] as const)(
  'retains private bytes used by an invalid external %s consumer during replacement',
  async (kind) => {
    const target = stores();
    const parent = createVideoProjectEntryWithMediaClip();
    const other = createVideoProjectEntryWithMediaClip({ id: 'other' });
    const resource = {
      id: 'project-asset-1',
      assetId: 'private-body',
      createdAt: 1,
      mimeType: 'video/webm',
      size: 6,
    };
    target.projects.get = vi.fn(async () => parent);
    target.assets.get = vi.fn(async (key) =>
      key === resource.id ? resource : { ...resource, id: 'private-aux', assetId: 'aux-body' }
    );
    target.projects.getAll = vi.fn(async () =>
      kind === 'video' ? [{ ...other, project: { ...other.project, name: 123 } }] : []
    );
    target.videoWorkspaces.getAll = vi.fn(async () => [
      reviewWorkspace(`project-asset:${resource.id}`, 'private-aux'),
      ...(kind === 'review' ? [{ ...reviewWorkspace('external', resource.id), revision: -1 }] : []),
    ]);
    await putVideoProjectBackupRestore({
      operation: physicalDeleteOperation(),
      root: {
        assets: [],
        entry: { ...parent, project: { ...parent.project, assets: [], tracks: [] } },
        exports: [],
      },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    });
    expect(target.assets.delete).not.toHaveBeenCalledWith(resource.id);
    expect(target.owners.delete).not.toHaveBeenCalled();
    expect(target.refs.delete).not.toHaveBeenCalled();
  }
);
