import { initDB } from '../infrastructure/indexed-db/core';

import { beforeEach, expect, it, vi } from 'vitest';

import { createCleanupWebSnapshotRecord } from '../../../workflows/media-hub/cleanup.test-support';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { collectSyncCaptureClaims } from './claims';
import { captureMediaInTransaction } from './capture';

import { applyCatalogDeletionNative } from './apply-deletion';
import { applyPreparedMediaReplica } from './apply-media';

import { createMediaReplicaFixture } from './test-support/apply-media';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  read: vi.fn(),
  snapshotCheck: vi.fn(),
  screenshotCheck: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: vi.fn().mockResolvedValue(undefined),
  listReadyJournals: vi.fn().mockResolvedValue([]),
  readAssetFile: io.read,
}));
vi.mock('../../../features/web-snapshot/provenance', async (original) => ({
  ...(await original<typeof import('../../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: io.snapshotCheck,
  readWebSnapshotPackageScreenshotBytes: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock('../../../features/web-snapshot/screenshot-validation', async (original) => ({
  ...(await original<typeof import('../../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: io.screenshotCheck,
}));
vi.mock('../web-snapshots/media-entry', async (original) => ({
  ...(await original<typeof import('../web-snapshots/media-entry')>()),
  createWebSnapshotThumbnailEntry: async (args: {
    assetId: string;
    screenshotBlob: Blob;
    createdAt: number;
    updatedAt: number;
  }) => ({
    assetId: args.assetId,
    blob: args.screenshotBlob,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    width: 1,
    height: 1,
  }),
}));
beforeEach(() => vi.clearAllMocks());

function setup() {
  const fixture = createMediaReplicaFixture();
  io.database.mockResolvedValue(fixture.database);
  return fixture;
}

it('publishes a saved snapshot through native package and screenshot ownership and replays without files', async () => {
  const f = setup();
  f.rows.set('web_snapshots', new Map());
  const webSnapshot = createCleanupWebSnapshotRecord('saved-snapshot');
  const ref = {
    ...f.input.rows.ref,
    assetId: webSnapshot.packageAssetId,
    size: webSnapshot.size,
    mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
    location: { kind: 'opfs' as const, objectKey: `objects/${webSnapshot.packageAssetId}` },
  };
  const screenshotRef = {
    ...ref,
    assetId: webSnapshot.screenshotAssetId,
    size: webSnapshot.screenshotSize,
    mimeType: webSnapshot.screenshotMimeType,
    location: { kind: 'opfs' as const, objectKey: `objects/${webSnapshot.screenshotAssetId}` },
  };
  const media = {
    ...f.input.rows.media,
    id: webSnapshot.id,
    source: { kind: 'web-snapshot' as const, snapshotId: webSnapshot.id },
    kind: 'web-archive' as const,
    size: ref.size,
    mimeType: ref.mimeType,
    filename: 'snapshot.sniptale-page-package.zip',
    originalFilename: 'snapshot.sniptale-page-package.zip',
  };
  const input = { ...f.input, rows: { media, webSnapshot, ref, screenshotRef } };
  io.read.mockImplementation(
    async (binding: typeof ref, name: string) =>
      new File([new Uint8Array(binding.size)], name, { type: binding.mimeType })
  );
  io.snapshotCheck.mockResolvedValue({ changed: false });
  io.screenshotCheck.mockResolvedValue({ width: 1, height: 1 });
  f.failReceipt();
  const initial = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(input)).rejects.toThrow();
  expect(f.rows).toEqual(initial);
  f.allowWrites();
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementation(async (binding: typeof ref, name: string) => {
    if (name.startsWith('parallel')) {
      entered();
      await gate;
    }
    return new File([new Uint8Array(binding.size)], name, { type: binding.mimeType });
  });
  const parallel = applyPreparedMediaReplica({
    ...input,
    operationId: 'parallel-snapshot',
    rows: { ...input.rows, media: { ...media, filename: 'parallel.sniptale-page-package.zip' } },
  });
  await blocked;
  await expect(applyPreparedMediaReplica(input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  const accepted = structuredClone(f.rows);
  release();
  await expect(parallel).rejects.toThrow();
  expect(f.rows).toEqual(accepted);
  expect(io.snapshotCheck).toHaveBeenCalledWith(expect.any(File), webSnapshot.manifest, {
    includeSourceMetadata: true,
    requireManifestMatch: true,
  });
  expect(io.screenshotCheck).toHaveBeenCalled();
  expect(f.table('web_snapshots').get(webSnapshot.id)).toEqual(webSnapshot);
  expect(
    f.table('asset_owners').get(JSON.stringify(['web-snapshot', webSnapshot.id, 'screenshot']))
  ).toMatchObject({ assetId: screenshotRef.assetId });
  await applyCatalogDeletionNative({
    rootKind: 'media',
    rootId: media.id,
    operationId: 'delete-snapshot',
    sourceDigest: 'd'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedLocalGeneration: 1,
    expectedBasis: [input.operationId],
    expectedWorkspaceRevision: null,
  });
  await applyPreparedMediaReplica({
    ...input,
    operationId: 'recreate-snapshot',
    expectedLocalGeneration: 2,
    expectedBasis: ['delete-snapshot'],
  });
  const recreated = structuredClone(f.rows);
  await expect(
    applyPreparedMediaReplica({
      ...input,
      operationId: 'delayed-snapshot',
      expectedLocalGeneration: 1,
      expectedBasis: [input.operationId],
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(recreated);
  const tx = (await initDB()).transaction([...f.rows.keys()], 'readwrite');
  const capture = await captureMediaInTransaction(tx, webSnapshot.id);
  await tx.done;
  expect(collectSyncCaptureClaims([capture]).assetIds).toEqual(
    new Set([ref.assetId, screenshotRef.assetId])
  );
  const before = structuredClone(f.rows);
  io.read.mockRejectedValue(new Error('staging removed'));
  await expect(applyPreparedMediaReplica(input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(f.rows).toEqual(before);
});
