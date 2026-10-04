import { createVideoProjectRestoreTransaction } from './index.test-support';
import { expect, it, vi } from 'vitest';
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
    videoWorkspaces: store(),
    videoDrafts: store(),
    operations: store(),
    owners,
    presentations: store(),
    projects: store(),
    refs: store(),
    thumbnails: store(),
    scenarioAssets: store(),
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

it('restores an archived temporary project as permanent without changing its graph', async () => {
  const target = stores();
  const entry = createVideoProjectEntry({ id: 'legacy-import' }, { id: 'legacy-import' });
  entry.lifecycle = { savedAt: null, storageClass: 'temporary', updatedAt: 10 };
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.projects.put).toHaveBeenCalledWith({
    ...entry,
    lifecycle: expect.objectContaining({ savedAt: 10, storageClass: 'library' }),
  });
});

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
      tx: createVideoProjectRestoreTransaction(target),
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
      tx: createVideoProjectRestoreTransaction(target),
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
      tx: createVideoProjectRestoreTransaction(target),
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
      tx: createVideoProjectRestoreTransaction(target),
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
  target.exports.get = vi.fn(async (key) =>
    key === existingExport.id ? existingExport : undefined
  );
  target.projects.put = vi.fn(async (value) => {
    vi.mocked(target.projects.getAll).mockResolvedValue([value]);
  });
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
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).resolves.toEqual({ conflicted: true, imported: true });

  expect(target.assets.delete).toHaveBeenCalledWith('project-asset-1');
  expect(target.exports.delete).toHaveBeenCalledWith('old-export');
  for (const id of ['project-asset:project-asset-1', 'export:old-export']) {
    expect(target.videoWorkspaces.delete).toHaveBeenCalledWith(id);
    expect(target.videoDrafts.delete).toHaveBeenCalledWith(id);
  }
  expect(target.projects.delete).toHaveBeenCalledWith('project');
  expect(pendingDelete.assetIds).toHaveLength(2);
  expect(pendingDelete.assetIds).toEqual(expect.arrayContaining(['asset-object', 'export-object']));
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
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });

  expect(target.exports.put).toHaveBeenCalledWith(exportEntry);
  expect(target.thumbnails.put).toHaveBeenCalledWith(thumbnail);
  expect(target.presentations.put).toHaveBeenCalledWith(presentation);
});
it('restores a private project representation without publishing a Library card', async () => {
  const target = stores();
  await putVideoProjectBackupRestore({
    operation: operation(),
    strategy: 'replace',
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    root: {
      entry: createVideoProjectEntry(),
      exports: [],
      assets: [
        {
          entry: { id: 'private', assetId: 'local', createdAt: 1, mimeType: 'image/png', size: 1 },
          filename: 'image.png',
          ref,
          publishToLibrary: false,
        },
      ],
    },
  });
  expect(target.assets.put).toHaveBeenCalled();
  expect(target.owners.put).toHaveBeenCalled();
  expect(target.media.put).not.toHaveBeenCalled();
});

it.each(['same', 'changed', 'missing'] as const)(
  'revalidates explicitly reused export bytes before any replacement: %s',
  async (state) => {
    const { createProjectExportEntry, createMediaLibraryEntry } =
      await import('./index.test-support');
    const target = stores();
    const previous = createProjectExportEntry({
      id: 'shared-export',
      assetId: 'original',
      projectId: 'old-parent',
      size: 1,
      mimeType: 'video/webm',
    });
    const exported = {
      entry: { ...previous, projectId: 'new-parent' },
      ref: { ...ref, assetId: previous.assetId, mimeType: 'video/webm' },
      reusePublished: true,
    };
    const media = createMediaLibraryEntry({
      id: `export:${previous.id}`,
      source: { kind: 'project-export', exportId: previous.id, projectId: previous.projectId },
    });
    target.exports.get = vi.fn(async () =>
      state === 'missing'
        ? undefined
        : state === 'changed'
          ? { ...previous, assetId: 'replaced' }
          : previous
    );
    target.media.get = vi.fn(async () => media);
    const restore = () =>
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: createVideoProjectEntry({ id: 'new-parent' }, { id: 'new-parent' }),
          exports: [exported],
        },
        stores: target,
        tx: createVideoProjectRestoreTransaction(target),
        strategy: 'replace',
      });
    if (state === 'same') {
      await expect(restore()).resolves.toEqual({ imported: true, conflicted: false });
      expect(target.exports.put).toHaveBeenCalledWith(exported.entry);
      expect(target.media.put).toHaveBeenCalledWith(
        expect.objectContaining({
          ...media,
          source: { ...media.source, projectId: 'new-parent' },
        })
      );
      expect(target.refs.put).not.toHaveBeenCalled();
      expect(target.owners.put).not.toHaveBeenCalled();
    } else {
      await expect(restore()).rejects.toThrow('changed after preparation');
      expect(target.projects.put).not.toHaveBeenCalled();
      expect(target.exports.put).not.toHaveBeenCalled();
    }
  }
);

it('preserves independently published exports when replacing their parent project', async () => {
  const { createProjectExportEntry, createMediaLibraryEntry } =
    await import('./index.test-support');
  const target = stores();
  const parent = createVideoProjectEntry();
  const exported = createProjectExportEntry({ projectId: parent.id });
  target.projects.get = vi.fn(async () => parent);
  target.exports.index = vi.fn(() => ({ getAll: vi.fn(async () => [exported]) }));
  target.media.get = vi.fn(async () =>
    createMediaLibraryEntry({
      id: `export:${exported.id}`,
      source: { kind: 'project-export', exportId: exported.id, projectId: parent.id },
    })
  );
  await putVideoProjectBackupRestore({
    operation: operation(),
    root: { assets: [], entry: parent, exports: [] },
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    strategy: 'replace',
  });
  expect(target.exports.delete).not.toHaveBeenCalled();
  expect(target.media.delete).not.toHaveBeenCalledWith(`export:${exported.id}`);
  expect(target.owners.delete).not.toHaveBeenCalled();
});

it.each(['missing', 'wrong-id', 'wrong-kind', 'wrong-export', 'wrong-parent'] as const)(
  'refuses a changed published export identity before project writes: %s',
  async (failure) => {
    const { createProjectExportEntry, createMediaLibraryEntry } =
      await import('./index.test-support');
    const target = stores();
    const entry = createProjectExportEntry({
      id: 'shared',
      assetId: 'body',
      projectId: 'old',
      mimeType: 'video/webm',
    });
    const media = createMediaLibraryEntry({
      id: failure === 'wrong-id' ? 'different' : 'export:shared',
      source:
        failure === 'wrong-kind'
          ? { kind: 'screenshot' }
          : {
              kind: 'project-export',
              exportId: failure === 'wrong-export' ? 'different' : entry.id,
              projectId: failure === 'wrong-parent' ? 'different' : entry.projectId,
            },
    });
    target.exports.get = vi.fn(async () => entry);
    target.media.get = vi.fn(async () => (failure === 'missing' ? undefined : media));
    await expect(
      putVideoProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: createVideoProjectEntry(),
          exports: [
            {
              entry: { ...entry, projectId: 'new' },
              ref: { ...ref, assetId: entry.assetId, mimeType: 'video/webm' },
              reusePublished: true,
            },
          ],
        },
        stores: target,
        tx: createVideoProjectRestoreTransaction(target),
        strategy: 'replace',
      })
    ).rejects.toThrow('identity changed after preparation');
    expect(target.projects.put).not.toHaveBeenCalled();
    expect(target.media.put).not.toHaveBeenCalled();
  }
);

it('refuses a prepared shared project asset removed before consumer publication', async () => {
  const target = stores();
  const asset = {
    entry: { id: 'shared', assetId: 'body', mimeType: ref.mimeType, size: ref.size, createdAt: 1 },
    filename: 'shared.png',
    ref: { ...ref, assetId: 'body' },
    reusePublished: true,
  };
  await expect(
    putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [asset], entry: createVideoProjectEntry(), exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy: 'replace',
    })
  ).rejects.toThrow();
  expect(target.projects.put).not.toHaveBeenCalled();
  expect(target.assets.put).not.toHaveBeenCalled();
});

it('pins a direct Library source only when the archive parent is accepted', async () => {
  const { createMediaLibraryEntry } = await import('./index.test-support');
  const entry = createVideoProjectEntryWithMediaClip();
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: 'original' };
  const source = createMediaLibraryEntry({
    id: 'original',
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  for (const strategy of ['skip', 'replace'] as const) {
    const target = stores();
    target.projects.get = vi.fn(async () => entry);
    target.media.get = vi.fn(async (key) => (key === source.id ? source : undefined));
    await putVideoProjectBackupRestore({
      operation: operation(),
      root: { assets: [], entry, exports: [] },
      stores: target,
      tx: createVideoProjectRestoreTransaction(target),
      strategy,
    });
    if (strategy === 'skip') expect(target.media.put).not.toHaveBeenCalled();
    else
      expect(target.media.put).toHaveBeenCalledWith(
        expect.objectContaining({
          id: source.id,
          lifecycle: expect.objectContaining({ storageClass: 'library' }),
        })
      );
  }
});

it('publishes an accepted canonical project asset as permanent', async () => {
  const target = stores();
  const entry = createVideoProjectEntryWithMediaClip();
  const assets = new Map<IDBValidKey, unknown>();
  const media = new Map<IDBValidKey, unknown>();
  target.assets.get = vi.fn(async (key) => assets.get(key));
  target.assets.put = vi.fn(async (value) => {
    assets.set(value.id, value);
  });
  target.media.get = vi.fn(async (key) => media.get(key));
  target.media.put = vi.fn(async (value) => {
    media.set(value.id, value);
  });
  await putVideoProjectBackupRestore({
    operation: operation(),
    strategy: 'replace',
    stores: target,
    tx: createVideoProjectRestoreTransaction(target),
    root: {
      entry,
      exports: [],
      assets: [
        {
          entry: {
            id: 'project-asset-1',
            assetId: 'local',
            createdAt: 1,
            mimeType: ref.mimeType,
            size: ref.size,
          },
          filename: 'image.png',
          ref,
        },
      ],
    },
  });
  expect(media.get('project-asset:project-asset-1')).toMatchObject({
    lifecycle: { storageClass: 'library' },
  });
});
