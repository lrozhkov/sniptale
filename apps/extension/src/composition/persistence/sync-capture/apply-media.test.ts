import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { captureRootKey } from './contracts';
import { digestCapturedMediaRows } from './freeze';
import { parseSyncCaptureRecord } from './guards';
import { applyPreparedMediaReplica, type ApplyPreparedMediaReplicaInput } from './apply-media';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => vi.clearAllMocks());

function setup() {
  let failReceipt = false;
  let writes = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && ++writes === 2 && failReceipt
  );
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'local-body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/local-body' },
    mimeType: 'image/png',
    sha256: 'b'.repeat(64),
    size: 6,
  };
  const media = createMediaLibraryEntry({
    id: 'project-asset:source',
    source: { kind: 'project-asset', projectAssetId: 'source' },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  const input: ApplyPreparedMediaReplicaInput = {
    operationId: 'source-op',
    sourceDigest: 'a'.repeat(64),
    connectionGeneration: 3,
    expectedLocalGeneration: 0,
    rows: {
      media,
      ref,
      projectAsset: {
        id: 'source',
        assetId: ref.assetId,
        mimeType: ref.mimeType,
        size: ref.size,
        createdAt: 1,
      },
    },
  };
  const rootKey = captureRootKey('space', 'media', media.id);
  return {
    ...fixture,
    table,
    input,
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    failReceipt() {
      failReceipt = true;
      writes = 0;
    },
    allowWrites() {
      failReceipt = false;
      writes = 0;
    },
  };
}

it('admits a Library source with a real causal head and no outgoing echo', async () => {
  const f = setup();
  expect(await applyPreparedMediaReplica(f.input)).toEqual({ status: 'applied', generation: 1 });
  expect(f.table('media_library').get(f.input.rows.media.id)).toEqual(
    parseMediaLibraryEntry(f.input.rows.media)
  );
  expect(f.table('project_assets').get('source')).toEqual(f.input.rows.projectAsset);
  expect(f.table('asset_refs').get('local-body')).toEqual(f.input.rows.ref);
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
    basis: ['source-op'],
    generation: 1,
    nativeDigest: digestCapturedMediaRows(f.input.rows),
  });
  expect(
    [...f.table('sync_capture').values()].some(
      (row) => parseSyncCaptureRecord(row)?.kind === 'captured-change'
    )
  ).toBe(false);
  expect([...f.table('asset_owners').values()]).toEqual([
    { assetId: 'local-body', ownerId: 'source', ownerKind: 'project-asset', role: 'body' },
  ]);
});

it('accepts one absent predecessor and refuses a different concurrent operation', async () => {
  const f = setup();
  const second = structuredClone(f.input);
  second.operationId = 'other-op';
  await applyPreparedMediaReplica(f.input);
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(second)).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it('refuses a retained deleted root instead of recreating it', async () => {
  const f = setup();
  f.table('sync_capture').set(f.stateKey, {
    version: 1,
    kind: 'root-state',
    key: f.stateKey,
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: f.input.rows.media.id,
    rootKey: f.rootKey,
    generation: 4,
    basis: ['deleted-op'],
  });
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it('refuses a recreated native source even when its bytes match', async () => {
  const f = setup();
  f.table('project_assets').set('source', f.input.rows.projectAsset);
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it('rolls source publication and causal receipt back on failure and accepts one retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failReceipt();
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.allowWrites();
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({ status: 'applied' });
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({ status: 'duplicate' });
});

it('returns an exact receipt duplicate before checking later native changes', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  f.table('media_library').delete(f.input.rows.media.id);
  const profile = parseSyncCaptureRecord(f.table('sync_capture').get('profile'));
  if (!profile || profile.kind !== 'profile') throw new Error('Missing test profile');
  f.table('sync_capture').set('profile', { ...profile, enabled: false });
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(f.rows).toEqual(before);
  await expect(
    applyPreparedMediaReplica({ ...f.input, sourceDigest: 'c'.repeat(64) })
  ).rejects.toThrow('receipt-conflict');
});

it('refuses a changed connection before publishing a source', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica({ ...f.input, connectionGeneration: 4 })).rejects.toThrow(
    'profile-changed'
  );
  expect(f.rows).toEqual(before);
});

it.each(['image_workspaces', 'video_workspace_drafts', 'thumbnails'])(
  'refuses orphan %s sidecars',
  async (name) => {
    const f = setup();
    f.table(name).set(f.input.rows.media.id, { aggregateId: f.input.rows.media.id });
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('source-changed');
    expect(f.rows).toEqual(before);
  }
);

it('refuses a changed physical binding without replacing its ref', async () => {
  const f = setup();
  f.table('asset_refs').set('local-body', { ...f.input.rows.ref, size: 100 });
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it('refuses mismatched metadata and nonzero local predecessors', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  await expect(
    applyPreparedMediaReplica({ ...f.input, expectedLocalGeneration: 1 })
  ).rejects.toThrow('invalid-input');
  const changed = structuredClone(f.input);
  changed.rows.ref.size++;
  await expect(applyPreparedMediaReplica(changed)).rejects.toThrow('invalid-input');
  expect(f.rows).toEqual(before);
});
