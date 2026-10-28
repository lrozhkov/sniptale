import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal } from '../assets/contracts';
const mocks = vi.hoisted(() => ({ runMutation: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
import { PROJECT_ASSET_PUBLICATION_DOMAIN, publishProjectAssetJournal } from './asset-publication';
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
