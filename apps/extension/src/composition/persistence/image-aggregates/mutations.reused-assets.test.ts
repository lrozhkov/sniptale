import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';

const mocks = vi.hoisted(() => ({
  assetSequence: 0,
  createJournal: vi.fn(),
  deleteAssetObject: vi.fn(async (_assetId: string) => undefined),
  cancelPublication: vi.fn(),
  discardPreparedAsset: vi.fn(async () => undefined),
  initDB: vi.fn(),
  releaseProtection: vi.fn(async () => undefined),
  recoverStandalone: vi.fn(async () => 0),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  createAssetPublicationJournal: mocks.createJournal,
  deleteAssetObject: mocks.deleteAssetObject,
  cancelAssetPublication: mocks.cancelPublication,
  discardPreparedAsset: mocks.discardPreparedAsset,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  readAssetFile: vi.fn(async () => new File(['original'], 'image.png', { type: 'image/png' })),
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
  releaseAssetReadyProtection: mocks.releaseProtection,
  writeBlobToAsset: vi.fn(async (blob: Blob) => {
    const assetId = `staged-${++mocks.assetSequence}`;
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type || 'application/octet-stream',
        sha256: null,
        size: blob.size,
      },
    };
  }),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: vi.fn(async () => new Blob(['thumbnail'])),
}));

import { commitImageWorkspace, imageWorkspacePublicationAdapter } from './mutations';
import { recoverAndGetStoredImageWorkspace } from '../image-workspaces';

function createMediaRoot(revision: number) {
  return {
    blob: new Blob(['original'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'image-1',
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 8,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 100,
    workspaceRevision: revision,
  };
}

function installMixedWorkspaceTransaction() {
  const media = createMediaRoot(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 1,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture()),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  const stores = {
    sync_capture: { get: vi.fn(async () => undefined) },
    aggregate_presentations: { get: vi.fn(), put: vi.fn() },
    asset_operations: { put: vi.fn() },
    asset_owners: {
      delete: vi.fn(),
      index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
      put: vi.fn(),
    },
    asset_refs: { delete: vi.fn(), put: vi.fn() },
    image_workspaces: { get: vi.fn(async () => workspace), put: vi.fn() },
    media_library: { get: vi.fn(async () => media), put: vi.fn() },
  };
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
      })),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assetSequence = 0;
  mocks.cancelPublication.mockImplementation(async (journal) => {
    for (const ref of journal.assetRefs) await mocks.deleteAssetObject(ref.assetId);
  });
  mocks.createJournal.mockImplementation(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'mixed-journal',
  }));
  mocks.initDB.mockResolvedValue({ get: vi.fn(async () => undefined) });
  installMixedWorkspaceTransaction();
});

it('journals, replays, and rolls back only newly staged assets in a mixed publication', async () => {
  const runtimeSourceUrl = 'blob:hydrated-source';
  const reusedRef = {
    assetId: 'editor-source',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/editor-source' },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
  const document = createEditorDocumentFixture();
  document.sourceImageData = runtimeSourceUrl;
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  const input = {
    aggregateId: 'image-1',
    captureTime: 3,
    document,
    expectedRevision: 2,
    reusableAssetsByRuntimeUrl: new Map([[runtimeSourceUrl, reusedRef]]),
  };

  await commitImageWorkspace(input);

  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs.map((ref: { assetId: string }) => ref.assetId)).toEqual(['staged-1']);
  expect(journal.payload.refs.map((ref: { assetId: string }) => ref.assetId).sort()).toEqual([
    'editor-source',
    'staged-1',
  ]);
  expect(journal.payload.captureTime).toBe(3);
  expect(mocks.releaseProtection).toHaveBeenCalledWith(['staged-1']);

  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string) => {
      if (store === 'media_library') return createMediaRoot(4);
      return undefined;
    }),
  });
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(mocks.deleteAssetObject).toHaveBeenCalledWith('staged-1');
  expect(mocks.deleteAssetObject).not.toHaveBeenCalledWith('editor-source');

  mocks.discardPreparedAsset.mockClear();
  mocks.createJournal.mockRejectedValueOnce(new Error('journal unavailable'));
  await expect(commitImageWorkspace(input)).rejects.toThrow('journal unavailable');
  expect(mocks.discardPreparedAsset).toHaveBeenCalledOnce();
  expect(mocks.discardPreparedAsset).toHaveBeenCalledWith('staged-2');
  expect(mocks.discardPreparedAsset).not.toHaveBeenCalledWith('editor-source');
});

it('recovers a losing two-tab publication when the winning role owns a different asset', async () => {
  const losingDocument = createEditorDocumentFixture();
  losingDocument.sourceImageData = 'blob:hydrated-source';
  losingDocument.frame.backgroundImageData = 'data:image/png;base64,bG9zZXI=';
  await commitImageWorkspace({
    aggregateId: 'image-1',
    document: losingDocument,
    expectedRevision: 2,
    reusableAssetsByRuntimeUrl: new Map([
      [
        'blob:hydrated-source',
        {
          assetId: 'editor-source',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/editor-source' },
          mimeType: 'image/png',
          sha256: null,
          size: 6,
        },
      ],
    ]),
  });
  const losingJournal = await mocks.createJournal.mock.results[0]!.value;
  const losingAssetId = losingJournal.assetRefs[0].assetId as string;
  const losingRole = losingJournal.payload.document.assets.find(
    (asset: { assetId: string }) => asset.assetId === losingAssetId
  ).role as string;
  const winnerAssetId = 'winning-background';
  const winnerRoot = createMediaRoot(3);
  const winningDocument = createPersistedEditorDocumentFixture(createEditorDocumentFixture());
  winningDocument.frame.backgroundImage = { assetId: winnerAssetId };
  winningDocument.assets.push({ assetId: winnerAssetId, role: losingRole });
  const winnerWorkspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: winningDocument,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 3,
  };
  const otherWorkspace = { ...winnerWorkspace, aggregateId: 'image-2', revision: 1 };
  const get = vi.fn(async (store: string, key: unknown) => {
    if (store === 'media_library' && key === 'image-1') return winnerRoot;
    if (store === 'image_workspaces' && key === 'image-1') return winnerWorkspace;
    if (store === 'image_workspaces' && key === 'image-2') return otherWorkspace;
    if (store === 'asset_owners') {
      return {
        assetId: winnerAssetId,
        ownerKind: 'image-workspace',
        ownerId: 'image-1',
        role: losingRole,
      };
    }
    return undefined;
  });
  mocks.initDB.mockResolvedValue({ get });
  mocks.recoverStandalone.mockClear();
  let pendingJournal: typeof losingJournal | null = losingJournal;
  mocks.recoverStandalone.mockImplementation(async () => {
    if (!pendingJournal) return 0;
    await imageWorkspacePublicationAdapter.publish(pendingJournal);
    pendingJournal = null;
    return 1;
  });

  await expect(recoverAndGetStoredImageWorkspace('image-1')).resolves.toEqual(winnerWorkspace);
  await expect(recoverAndGetStoredImageWorkspace('image-2')).resolves.toEqual(otherWorkspace);
  await expect(recoverAndGetStoredImageWorkspace('image-1')).resolves.toEqual(winnerWorkspace);
  expect(mocks.recoverStandalone).toHaveBeenCalledTimes(3);
  expect(mocks.deleteAssetObject).toHaveBeenCalledWith(losingAssetId);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalledWith(winnerAssetId);
});

it.each([
  ['malformed root', 'media_library', { id: 'image-1' }],
  ['orphan workspace', 'image_workspaces', { aggregateId: 'image-1' }],
  ['orphan presentation', 'aggregate_presentations', { aggregateId: 'image-1' }],
])(
  'discards a pending image copy when its id has an occupied %s',
  async (_, occupiedStore, row) => {
    const document = createEditorDocumentFixture();
    document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
    await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
    const journal = await mocks.createJournal.mock.results[0]!.value;
    const copyJournal = {
      ...journal,
      payload: { ...journal.payload, requireMissingRoot: true },
    };
    mocks.runMutation.mockClear();
    mocks.initDB.mockResolvedValue({
      get: vi.fn(async (store: string) => (store === occupiedStore ? row : undefined)),
    });

    await expect(imageWorkspacePublicationAdapter.publish(copyJournal)).resolves.toBeUndefined();
    expect(mocks.runMutation).not.toHaveBeenCalled();
    expect(mocks.deleteAssetObject).toHaveBeenCalledWith(copyJournal.assetRefs[0].assetId);
  }
);

it('keeps staged bytes when an occupied copy id has ambiguous asset ownership', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs).toHaveLength(2);
  const stagedRef = journal.assetRefs[1];
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'media_library') return { id: 'image-1' };
      if (store === 'asset_refs' && key === stagedRef.assetId) return stagedRef;
      return undefined;
    }),
  });
  mocks.deleteAssetObject.mockClear();

  await expect(
    imageWorkspacePublicationAdapter.publish({
      ...journal,
      payload: { ...journal.payload, requireMissingRoot: true },
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
});

it('discards an orphan workspace even when its document matches a pending copy', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  const workspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: journal.payload.document,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string) => (store === 'image_workspaces' ? workspace : undefined)),
  });
  mocks.deleteAssetObject.mockClear();

  await imageWorkspacePublicationAdapter.publish({
    ...journal,
    payload: { ...journal.payload, requireMissingRoot: true },
  });

  expect(mocks.deleteAssetObject).toHaveBeenCalledWith(journal.assetRefs[0].assetId);
});

it('keeps bytes of an already committed copy during journal replay', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Y2hhbmdlZA==';
  await commitImageWorkspace({ aggregateId: 'image-1', document, expectedRevision: 2 });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  const workspace = {
    aggregateId: 'image-1',
    createdAt: 1,
    document: journal.payload.document,
    revision: 3,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  };
  mocks.initDB.mockResolvedValue({
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'image_workspaces') return workspace;
      if (store === 'media_library') return createMediaRoot(3);
      if (store === 'asset_refs') {
        return journal.assetRefs.find((ref: { assetId: string }) => ref.assetId === key);
      }
      if (store === 'asset_owners' && Array.isArray(key)) {
        const ownedAsset = journal.payload.document.assets.find(
          (asset: { role: string }) => asset.role === key[2]
        );
        if (!ownedAsset) return undefined;
        return {
          assetId: ownedAsset.assetId,
          ownerId: 'image-1',
          ownerKind: 'image-workspace',
          role: ownedAsset.role,
        };
      }
      return undefined;
    }),
  });
  mocks.deleteAssetObject.mockClear();
  mocks.runMutation.mockClear();

  await imageWorkspacePublicationAdapter.publish({
    ...journal,
    payload: { ...journal.payload, requireMissingRoot: true },
  });

  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  expect(mocks.runMutation).not.toHaveBeenCalled();
});

async function importedFirstSaveFixture() {
  const { createReviewWorkspaceStoreFixture } =
    await import('../review-workspaces/store.test-support');
  const { createMediaLibraryEntry, createProjectAssetEntry } =
    await import('../projects/index.test-support');
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'image_workspaces');
  const table = (name: string) => fixture.rows.get(name)!;
  const ref = {
    assetId: 'imported-original',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/imported-original' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  const child = createProjectAssetEntry({
    id: 'imported-child',
    assetId: ref.assetId,
    mimeType: ref.mimeType,
    size: ref.size,
  });
  const media = createMediaLibraryEntry({
    id: `project-asset:${child.id}`,
    source: { kind: 'project-asset', projectAssetId: child.id },
    workspaceRevision: 0,
    imageContentState: 'original',
    size: ref.size,
    mimeType: ref.mimeType,
    lifecycle: createLibraryLifecycle('library', 1),
  });
  table('media_library').set(media.id, media);
  table('project_assets').set(child.id, child);
  table('asset_refs').set(ref.assetId, ref);
  const ownerKey = JSON.stringify(['project-asset', child.id, 'body']);
  const owner = {
    ownerKind: 'project-asset',
    ownerId: child.id,
    role: 'body',
    assetId: ref.assetId,
  };
  table('asset_owners').set(ownerKey, owner);
  mocks.initDB.mockResolvedValue(fixture.database);
  mocks.runMutation.mockImplementation(async (effect) => effect(fixture.database));
  const document = createEditorDocumentFixture();
  document.sourceImageData = 'data:image/png;base64,b3JpZ2luYWw=';
  return {
    ...fixture,
    table,
    ref,
    child,
    media,
    owner,
    ownerKey,
    document,
    fail: () => {
      fail = true;
    },
    allow: () => {
      fail = false;
    },
    input: { aggregateId: media.id, expectedRevision: 0, document, requireExistingRoot: true },
  };
}

it('reuses the imported original on the first native workspace save without a runtime reuse map', async () => {
  const f = await importedFirstSaveFixture();
  const saved = await commitImageWorkspace(f.input);
  expect(saved.documentAssetsByRuntimeUrl.get(f.document.sourceImageData)).toEqual(f.ref);
  expect(mocks.assetSequence).toBe(0);
  expect(f.table('asset_refs').size).toBe(1);
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(f.table('asset_owners').get(f.ownerKey)).toEqual(f.owner);
  expect(f.table('image_workspaces').get(f.media.id)).toMatchObject({
    document: { sourceImage: { assetId: f.ref.assetId } },
  });
  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs).toEqual([]);
  expect(mocks.releaseProtection).toHaveBeenCalledWith([]);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
});

it.each(['child', 'ref', 'owner', 'delete', 'recreate'] as const)(
  'refuses a delayed imported original reuse after controlled %s without changing replacement rows',
  async (change) => {
    const f = await importedFirstSaveFixture();
    let replaced = structuredClone(f.rows);
    mocks.createJournal.mockImplementationOnce(async (args) => {
      if (change === 'child')
        f.table('project_assets').set(f.child.id, { ...f.child, createdAt: f.child.createdAt + 1 });
      if (change === 'ref')
        f.table('asset_refs').set(f.ref.assetId, {
          ...f.ref,
          location: { kind: 'opfs', objectKey: 'objects/replaced-original' },
        });
      if (change === 'owner')
        f.table('asset_owners').set(f.ownerKey, { ...f.owner, assetId: 'replacement-original' });
      if (change === 'delete') f.table('media_library').delete(f.media.id);
      if (change === 'recreate')
        f.table('media_library').set(f.media.id, { ...f.media, createdAt: f.media.createdAt + 1 });
      replaced = structuredClone(f.rows);
      return { ...args, createdAt: 1, journalId: 'controlled-original-race' };
    });
    await expect(commitImageWorkspace(f.input)).rejects.toThrow();
    expect(f.rows).toEqual(replaced);
    expect(mocks.assetSequence).toBe(0);
    expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  }
);

it(
  'keeps the imported original through failed workspace ownership publication and ' +
    'replays the same journal',
  async () => {
    const f = await importedFirstSaveFixture();
    const before = structuredClone(f.rows);
    f.fail();
    await expect(commitImageWorkspace(f.input)).rejects.toThrow();
    expect(f.rows).toEqual(before);
    expect(mocks.assetSequence).toBe(0);
    const journal = await mocks.createJournal.mock.results[0]!.value;
    expect(journal.assetRefs).toEqual([]);
    f.allow();
    await imageWorkspacePublicationAdapter.publish(journal);
    expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
    expect(f.table('asset_owners').get(f.ownerKey)).toEqual(f.owner);
    expect(f.table('asset_refs').size).toBe(1);
    const accepted = structuredClone(f.rows);
    await imageWorkspacePublicationAdapter.publish(journal);
    expect(f.rows).toEqual(accepted);
    expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  }
);

it('stages changed source pixels instead of reusing the imported original by identity alone', async () => {
  const f = await importedFirstSaveFixture();
  f.document.sourceImageData = 'data:image/png;base64,Y2hhbmdlISE=';
  const saved = await commitImageWorkspace(f.input);
  expect(mocks.assetSequence).toBe(1);
  expect(saved.documentAssetsByRuntimeUrl.get(f.document.sourceImageData)?.assetId).toBe(
    'staged-1'
  );
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(f.table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
  expect(f.table('asset_owners').get(f.ownerKey)).toEqual(f.owner);
  expect(f.table('asset_refs').size).toBe(2);
});

it('shares an imported original with its Montage borrower while staging only a new background', async () => {
  const f = await importedFirstSaveFixture();
  const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
  const borrower = createVideoProjectEntryWithMediaClip({ id: 'borrowed-imported-image' });
  borrower.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media.id };
  f.table('video_projects').set(borrower.id, borrower);
  f.document.frame.backgroundImageData = 'data:image/png;base64,YmFja2dyb3VuZA==';
  const saved = await commitImageWorkspace(f.input);
  expect(saved.documentAssetsByRuntimeUrl.get(f.document.sourceImageData)).toEqual(f.ref);
  expect(f.table('video_projects').get(borrower.id)).toEqual(borrower);
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(f.table('asset_owners').get(f.ownerKey)).toEqual(f.owner);
  expect(f.table('asset_refs').size).toBe(2);
  const journal = await mocks.createJournal.mock.results[0]!.value;
  expect(journal.assetRefs.map((ref: { assetId: string }) => ref.assetId)).toEqual(['staged-1']);
  expect(mocks.assetSequence).toBe(1);
  expect(mocks.releaseProtection).toHaveBeenCalledWith(['staged-1']);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
});

it('refuses a delayed parallel first Image writer after the competing native save commits', async () => {
  const f = await importedFirstSaveFixture();
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.createJournal.mockImplementationOnce(async (args) => {
    entered();
    await gate;
    return { ...args, createdAt: 1, journalId: 'delayed-first-original' };
  });
  const delayed = commitImageWorkspace(f.input);
  await reached;
  const winner = await commitImageWorkspace({
    ...f.input,
    document: { ...f.document, frame: { ...f.document.frame, paddingLeft: 10 } },
  });
  expect(winner.revision).toBe(1);
  const accepted = structuredClone(f.rows);
  release();
  await expect(delayed).rejects.toThrow();
  expect(f.rows).toEqual(accepted);
  expect(f.table('project_assets').get(f.child.id)).toEqual(f.child);
  expect(mocks.assetSequence).toBe(0);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
});
