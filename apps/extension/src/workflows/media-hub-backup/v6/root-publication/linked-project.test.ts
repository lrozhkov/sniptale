import { beforeEach, expect, it, vi } from 'vitest';
import { createLibraryLifecycle } from '../../../../composition/persistence/library-lifecycle/contracts';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { createMediaLibraryEntry } from '../../../../composition/persistence/projects/index.test-support';
import { workspace as quickEdit } from '../../../../composition/persistence/review-workspaces/backup-restore.test-support';
import { rowReferenceKey } from '../../../../composition/persistence/infrastructure/indexed-db/row-index-contract';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ArchiveRootPublisher } from '../restore';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { journal, portableJson, reviewFixture, session } from './media.review-assets.test-support';

const mocks = vi.hoisted(() => ({
  initDb: vi.fn(),
  mutate: vi.fn(),
  readFile: vi.fn(),
  checkpoint: vi.fn(),
  finishDeletion: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: mocks.initDb,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readFile,
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  completePhysicalDeleteOperation: mocks.finishDeletion,
}));

import { mediaLibraryRootPublisher } from './media';

function fixture(bytes = 'image') {
  const { blob: _blob, ...entry } = createMediaLibraryEntry({
    id: 'archive-project',
    filename: 'original.png',
    kind: 'screenshot',
    mimeType: 'image/png',
    size: 5,
    source: { kind: 'screenshot' },
    lifecycle: createLibraryLifecycle('library', 1),
  });
  const original = {
    ...entry,
    id: 'local-original',
    savedIndependently: false,
    blob: new Blob([bytes], { type: 'image/png' }),
  };
  const identity = {
    version: 1,
    aggregateId: original.id,
    generation: 'first-source-lifetime',
    retired: false,
  };
  const tables = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[original.id, original]])],
    ['image_workspace_identities', new Map([[original.id, identity]])],
  ]);
  const writes = vi.fn();
  const objectStore = (name: string) => {
    const records = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, records);
    return {
      get: async (id: string) => records.get(id),
      put: async (value: { id?: string; aggregateId?: string; assetId?: string }) => {
        writes(name, value);
        records.set(value.id ?? value.aggregateId ?? value.assetId ?? '', value);
      },
      delete: async (id: string) => records.delete(id),
      index: () => ({
        getAll: async (key: string) =>
          [...records.values()].filter(
            (row) =>
              isRecord(row) &&
              typeof row['sourceMediaId'] === 'string' &&
              rowReferenceKey('media', row['sourceMediaId']) === key
          ),
        getAllKeys: async () => [],
        count: async () => 0,
      }),
    };
  };
  const transaction = (names: string[]) => ({
    objectStore(name: string) {
      if (!names.includes(name))
        throw new DOMException(`Store ${name} is outside the transaction.`, 'NotFoundError');
      return objectStore(name);
    },
    done: Promise.resolve(),
    abort: vi.fn(),
  });
  const db = { transaction, get: (name: string, id: string) => objectStore(name).get(id) };
  mocks.initDb.mockResolvedValue(db);
  mocks.mutate.mockImplementation(async (effect) => effect(db));
  mocks.readFile.mockResolvedValue(new File(['image'], 'original.png', { type: 'image/png' }));
  const document = encodePortableEditorDocument({
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
    objectsByAssetId: new Map([['source', 'workspace']]),
  });
  const staged = ['original', 'workspace'].map((objectId) => ({
    objectId,
    ref: {
      assetId: `staged-${objectId}`,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/staged-${objectId}` },
      mimeType: 'image/png',
      sha256: null,
      size: 5,
    },
  }));
  const publication: Parameters<ArchiveRootPublisher['publish']>[0] = {
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/archive-project.json',
        objectCount: staged.length,
        rootId: entry.id,
        rootKind: 'media',
        totalBytes: 10,
      },
      metadata: portableJson({
        entry,
        linkedSourceMediaId: 'archive-original',
        originalObjectId: 'original',
        workspace: {
          aggregateId: entry.id,
          document,
          createdAt: 1,
          updatedAt: 2,
          revision: 1,
          sourceTitle: null,
          sourceUrl: null,
        },
      }),
      objects: [],
    },
    journal,
    staged,
    session: {
      ...session('skip'),
      rootIdMap: { 'media:library-item:archive-original': original.id },
    },
  };
  const publish = () => mediaLibraryRootPublisher.publish(publication);
  const replaceOriginal = () =>
    mediaLibraryRootPublisher.publish({
      ...publication,
      envelope: {
        ...publication.envelope,
        descriptor: { ...publication.envelope.descriptor, rootId: original.id },
        metadata: portableJson({
          entry: { ...entry, id: original.id },
          originalObjectId: 'original',
        }),
      },
      staged: staged.slice(0, 1),
      session: { ...publication.session, strategy: 'replace' },
    });
  return { db, writes, original, identity, tables, publication, publish, replaceOriginal };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.finishDeletion.mockResolvedValue(undefined);
});

it('restores a missing Image project over a skipped original without publishing another media row', async () => {
  const { publish, original, writes, tables } = fixture();
  const result = await publish();
  expect(result).toEqual({
    imported: true,
    conflicted: false,
    retainedAssetIds: ['staged-workspace'],
  });
  expect(writes).toHaveBeenCalledWith(
    'image_workspaces',
    expect.objectContaining({
      aggregateId: 'archive-project',
      sourceMediaId: original.id,
      lifecycle: { storageClass: 'library', updatedAt: 1, savedAt: 1 },
    })
  );
  expect(tables.get('media_library')).toEqual(new Map([[original.id, original]]));
  expect(mocks.checkpoint).toHaveBeenCalledWith(
    expect.anything(),
    'restore-1',
    expect.objectContaining({ imported: true, targetRootId: 'archive-project' })
  );
});

it('refuses an existing original with the same size and different bytes', async () => {
  const { publish, writes } = fixture('other');
  await expect(publish()).rejects.toThrow('original differs');
  expect(writes).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('duplicates a conflicting linked project with a new identity and the selected original', async () => {
  const { publish, publication, tables, original } = fixture();
  await publish();
  const result = await mediaLibraryRootPublisher.publish({
    ...publication,
    session: { ...publication.session, strategy: 'duplicate' },
  });
  expect(result.imported).toBe(true);
  expect(tables.get('media_library')?.size).toBe(1);
  const projects = tables.get('image_workspaces');
  expect(projects?.size).toBe(2);
  expect([...projects!.values()]).toEqual([
    expect.objectContaining({ aggregateId: 'archive-project', sourceMediaId: original.id }),
    expect.objectContaining({
      aggregateId: expect.not.stringMatching(/^archive-project$/),
      sourceMediaId: original.id,
    }),
  ]);
});

it('refuses publication when the original is recreated after the archived bytes are checked', async () => {
  const { db, publish, identity, writes, tables } = fixture();
  mocks.mutate.mockImplementationOnce(async (effect) => {
    tables.get('image_workspace_identities')?.set(identity.aggregateId, {
      ...identity,
      generation: 'replacement-source-lifetime',
    });
    return effect(db);
  });
  await expect(publish()).rejects.toThrow('original differs');
  expect(writes).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it.each([true, false])(
  'preserves an Image source under Replace when it already has a linked project, equal bytes=%s',
  async (sameBytes) => {
    const { replaceOriginal, publish, original, tables, writes } = fixture();
    await publish();
    writes.mockClear();
    if (!sameBytes)
      mocks.readFile.mockResolvedValue(new File(['other'], 'original.png', { type: 'image/png' }));
    const restore = replaceOriginal();
    if (sameBytes)
      await expect(restore).resolves.toEqual({
        imported: false,
        conflicted: true,
        retainedAssetIds: [],
      });
    else await expect(restore).rejects.toThrow('original differs');
    expect(writes).not.toHaveBeenCalled();
    expect(tables.get('media_library')?.get(original.id)).toEqual(original);
    expect(tables.get('image_workspaces')?.get('archive-project')).toMatchObject({
      sourceMediaId: original.id,
    });
  }
);

it('refuses a source replacement if an Image project acquires it after preparation', async () => {
  const { db, publish, replaceOriginal, original, tables } = fixture();
  mocks.mutate.mockImplementationOnce(async (effect) => {
    const preparation = await effect(db);
    await publish();
    return preparation;
  });
  await expect(replaceOriginal()).rejects.toThrow('acquired another project');
  expect(mocks.checkpoint).toHaveBeenCalledTimes(1);
  expect(tables.get('media_library')?.get(original.id)).toEqual(original);
  expect(tables.get('image_workspaces')?.get('archive-project')).toMatchObject({
    sourceMediaId: original.id,
  });
});

function quickFixture() {
  const { original, publication, tables, writes } = fixture();
  const originalId = 'project-asset:local-video';
  const reviewId = 'project-asset:quick-project:archived';
  const child = {
    id: 'local-video',
    assetId: 'source-bytes',
    size: 6,
    mimeType: 'video/webm',
    createdAt: 1,
  };
  const { blob: _blob, savedIndependently: _claim, ...media } = original;
  const { sourceAssetId: _sourceAssetId, ...review } = quickEdit;
  const entry = {
    ...media,
    id: originalId,
    source: { kind: 'project-asset', projectAssetId: child.id },
    kind: 'video',
    duration: 2,
    size: 6,
    mimeType: 'video/webm',
    filename: 'video.webm',
    originalFilename: 'video.webm',
  };
  const pointer = {
    assetId: child.assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source-bytes' },
    mimeType: 'video/webm',
    sha256: null,
    size: 6,
  };
  tables.set('media_library', new Map([[originalId, entry]]));
  tables.set('project_assets', new Map([[child.id, child]]));
  tables.set('asset_refs', new Map([[pointer.assetId, pointer]]));
  mocks.readFile.mockResolvedValue(new File(['video!'], 'video.webm', { type: 'video/webm' }));
  const quickPublication: Parameters<ArchiveRootPublisher['publish']>[0] = {
    ...publication,
    envelope: {
      ...publication.envelope,
      descriptor: { ...publication.envelope.descriptor, rootId: reviewId },
      metadata: portableJson({
        entry: {
          ...entry,
          id: reviewId,
          source: { kind: 'project-asset', projectAssetId: 'local-video' },
        },
        projectAsset: {
          id: 'local-video',
          size: 6,
          mimeType: 'video/webm',
          createdAt: 1,
        },
        originalObjectId: 'original',
        linkedSourceMediaId: originalId,
        videoReview: {
          workspace: {
            ...review,
            aggregateId: reviewId,
            formatVersion: 3,
            project: {
              name: 'Independent video work',
              lifecycle: createLibraryLifecycle('library', 2),
            },
          },
          draft: null,
        },
      }),
    },
    staged: [
      {
        objectId: 'original',
        ref: {
          ...pointer,
          assetId: 'staged-video',
          location: { kind: 'opfs', objectKey: 'objects/staged-video' },
        },
      },
    ],
    session: {
      ...publication.session,
      rootIdMap: { [`media:library-item:${originalId}`]: originalId },
    },
  };
  return { quickPublication, originalId, reviewId, child, entry, pointer, tables, writes };
}

it('keeps Quick Edit copies bound to the same native asset through Duplicate and source Replace', async () => {
  const { quickPublication, originalId, reviewId, child, entry, pointer, tables, writes } =
    quickFixture();
  const result = await mediaLibraryRootPublisher.publish(quickPublication);
  expect(result).toEqual({ imported: true, conflicted: false, retainedAssetIds: [] });
  expect(writes).toHaveBeenCalledWith(
    'video_workspaces',
    expect.objectContaining({
      aggregateId: reviewId,
      sourceMediaId: originalId,
      sourceAssetId: pointer.assetId,
      project: expect.objectContaining({ name: 'Independent video work' }),
    })
  );
  expect(tables.get('media_library')).toEqual(new Map([[originalId, entry]]));
  await mediaLibraryRootPublisher.publish({
    ...quickPublication,
    session: { ...quickPublication.session, strategy: 'duplicate' },
  });
  const ids = [...(tables.get('video_workspaces')?.keys() ?? [])];
  expect(ids).toEqual([reviewId, expect.stringMatching(/^project-asset:quick-project:/)]);
  expect(ids[1]).not.toBe(reviewId);

  const replace = await mediaLibraryRootPublisher.publish({
    ...quickPublication,
    envelope: {
      ...quickPublication.envelope,
      descriptor: { ...quickPublication.envelope.descriptor, rootId: originalId },
      metadata: portableJson({
        entry,
        projectAsset: { id: child.id, size: 6, mimeType: child.mimeType, createdAt: 1 },
        originalObjectId: 'original',
      }),
    },
    session: { ...quickPublication.session, strategy: 'replace' },
  });
  expect(replace).toEqual({ imported: false, conflicted: true, retainedAssetIds: [] });
  expect(tables.get('project_assets')?.get(child.id)).toEqual(child);
  expect(tables.get('asset_refs')?.get(pointer.assetId)).toEqual(pointer);
  expect(tables.get('video_workspaces')?.size).toBe(2);
});

it('replaces a Quick Edit project and releases its former private auxiliary after checking export inputs', async () => {
  const { quickPublication, originalId, reviewId, child, tables, writes } = quickFixture();
  const prior = {
    ...reviewFixture().workspace,
    aggregateId: reviewId,
    sourceMediaId: originalId,
    sourceAssetId: child.assetId,
  };
  tables.set('video_workspaces', new Map([[reviewId, prior]]));
  tables.get('project_assets')?.set('voice', {
    id: 'voice',
    assetId: 'private-voice-bytes',
    createdAt: 1,
    mimeType: 'audio/mpeg',
    size: 10,
  });
  const result = await mediaLibraryRootPublisher.publish({
    ...quickPublication,
    session: { ...quickPublication.session, strategy: 'replace' },
  });
  expect(result).toEqual({ imported: true, conflicted: true, retainedAssetIds: [] });
  expect(writes).toHaveBeenCalledWith(
    'video_workspaces',
    expect.objectContaining({
      aggregateId: reviewId,
      sourceAssetId: child.assetId,
      sourceMediaId: originalId,
    })
  );
  expect(tables.get('project_assets')?.has('voice')).toBe(false);
  expect(mocks.finishDeletion).toHaveBeenCalledWith(
    expect.objectContaining({
      assetIds: ['private-voice-bytes'],
    }),
    undefined
  );
});
