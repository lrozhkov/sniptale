import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal } from '../assets/contracts';
const mocks = vi.hoisted(() => ({
  runMutation: vi.fn(),
  initDB: vi.fn(),
  completeDelete: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: mocks.completeDelete,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  readAssetReadyPublicationClaims: async () => ({ valid: true, pending: false, journals: [] }),
}));
vi.mock('../media-library/delete-cascade.recovery', async (original) => ({
  ...(await original<typeof import('../media-library/delete-cascade.recovery')>()),
  recoverMediaSourcePublications: async () => undefined,
}));
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  projectAssetPublicationAdapter,
  publishProjectAssetJournal,
} from './asset-publication';
const ref = {
  assetId: 'asset-new',
  createdAt: 2,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-new' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};
beforeEach(() => {
  vi.clearAllMocks();
});
function createJournal(domain: string, payload: unknown): AssetReadyJournal {
  return { assetRefs: [ref], createdAt: 2, domain, journalId: 'journal-1', payload };
}

it('captures a published Library source in the same transaction before an editor exists', async () => {
  const { createReviewWorkspaceStoreFixture } =
    await import('../review-workspaces/store.test-support');
  const { parseSyncCaptureRecord } = await import('../sync-capture/guards');
  const { digestCapturedMediaRows } = await import('../sync-capture/freeze');
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'source-space',
    connectionGeneration: 1,
  });
  mocks.runMutation.mockImplementation(async (operation) => operation(fixture.database));
  const entry = {
    id: 'source-before-editor',
    assetId: ref.assetId,
    createdAt: 2,
    mimeType: ref.mimeType,
    size: ref.size,
  };
  const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
    entry,
    filename: 'source.webm',
  });
  await publishProjectAssetJournal(journal);
  const records = [...fixture.rows.get('sync_capture')!.values()].map(parseSyncCaptureRecord);
  const captured = records.find((row) => row?.kind === 'sync-operation');
  if (
    captured?.kind !== 'sync-operation' ||
    captured.phase !== 'native' ||
    captured.change.kind !== 'media' ||
    !('projectAsset' in captured.change.rows)
  )
    throw new Error('Expected native source capture');
  expect(captured).toMatchObject({
    rootKind: 'media',
    rootId: 'project-asset:source-before-editor',
    publicationId: journal.journalId,
    generation: 1,
    basis: [],
  });
  expect(captured.change.rows.projectAsset).toEqual(entry);
  expect(captured.change.rows.ref).toEqual(ref);
  expect(records.find((row) => row?.kind === 'root-state')).toMatchObject({
    generation: 1,
    basis: [captured.operationId],
    nativeDigest: digestCapturedMediaRows(captured.change.rows),
  });
  expect(fixture.rows.get('video_projects')!.size).toBe(0);
});

it('rolls source publication back when capture fails and captures one journal replay', async () => {
  const { createReviewWorkspaceStoreFixture } =
    await import('../review-workspaces/store.test-support');
  const { parseSyncCaptureRecord } = await import('../sync-capture/guards');
  let failCapture = true;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => failCapture && name === 'sync_capture'
  );
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'source-space',
    connectionGeneration: 1,
  });
  mocks.runMutation.mockImplementation(async (operation) => operation(fixture.database));
  const entry = {
    id: 'source-retry',
    assetId: ref.assetId,
    createdAt: 2,
    mimeType: ref.mimeType,
    size: ref.size,
  };
  const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
    entry,
    filename: 'source.webm',
  });
  const before = structuredClone(fixture.rows);
  await expect(publishProjectAssetJournal(journal)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(fixture.rows).toEqual(before);
  failCapture = false;
  await publishProjectAssetJournal(journal);
  const accepted = structuredClone(fixture.rows);
  await publishProjectAssetJournal(journal);
  expect(fixture.rows).toEqual(accepted);
  expect(
    [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation')
  ).toHaveLength(1);
});

it.each(['idle', 'cancel'])(
  'collects an unattached Montage import locally through %s',
  async (mode) => {
    const { createReviewWorkspaceStoreFixture } =
      await import('../review-workspaces/store.test-support');
    const { cleanupProjectOriginals } = await import('../../../workflows/media-hub/trash');
    const { listMediaLibrary } = await import('../media-library/index.library');
    const fixture = createReviewWorkspaceStoreFixture(() => false);
    const db = {
      ...fixture.database,
      transaction(stores: string | string[], mode: string, options?: IDBTransactionOptions) {
        const tx = fixture.database.transaction(
          typeof stores === 'string' ? [stores] : stores,
          mode
        );
        return Object.assign(tx, {
          durability: options?.durability,
          store: typeof stores === 'string' ? tx.objectStore(stores) : undefined,
        });
      },
      getAll: async (store: string) => [...(fixture.rows.get(store)?.values() ?? [])],
      getAllKeys: async (store: string) => [...(fixture.rows.get(store)?.keys() ?? [])],
    };
    mocks.initDB.mockResolvedValue(db);
    mocks.runMutation.mockImplementation(async (operation) => operation(db));
    mocks.completeDelete.mockResolvedValue(undefined);
    fixture.rows.get('sync_capture')!.set('profile', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'source-space',
      connectionGeneration: 1,
    });
    const entry = {
      id: 'abandoned',
      assetId: ref.assetId,
      createdAt: 2,
      mimeType: ref.mimeType,
      size: ref.size,
    };
    const journal = createJournal(PROJECT_ASSET_PUBLICATION_DOMAIN, {
      entry,
      expectedAssetId: null,
      filename: 'source.webm',
      projectRetained: true,
    });
    // Reopen the Library after the editor disappeared between upload and accepted placement.
    vi.stubGlobal('navigator', {});
    try {
      await projectAssetPublicationAdapter.publish(journal);
      const id = 'project-asset:abandoned';
      expect(fixture.rows.get('media_library')!.get(id)).toMatchObject({
        savedIndependently: false,
      });
      expect((await listMediaLibrary()).some((item) => item.id === id)).toBe(false);
      expect(fixture.rows.get('video_projects')!.size).toBe(0);
      expect([...fixture.rows.get('sync_capture')!.keys()]).toEqual(['profile']);
      const beforeReplay = structuredClone(fixture.rows);
      await projectAssetPublicationAdapter.publish(journal);
      expect(fixture.rows).toEqual(beforeReplay);

      if (mode === 'idle') {
        await cleanupProjectOriginals(new AbortController().signal);
      } else {
        const { deleteProjectAsset } = await import('./index');
        await deleteProjectAsset(entry.id);
      }
      expect(fixture.rows.get('media_library')!.has(id)).toBe(false);
      expect(fixture.rows.get('project_assets')!.has(entry.id)).toBe(false);
      expect(fixture.rows.get('asset_refs')!.has(ref.assetId)).toBe(false);
      expect(mocks.completeDelete).toHaveBeenCalledWith(
        expect.objectContaining({ assetIds: [ref.assetId] }),
        expect.any(Object)
      );
      expect([...fixture.rows.get('sync_capture')!.keys()]).toEqual(['profile']);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
