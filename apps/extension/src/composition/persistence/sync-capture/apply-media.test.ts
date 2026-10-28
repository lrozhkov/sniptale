import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { captureRootKey } from './contracts';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { digestCapturedMediaRows } from './freeze';
import { parseSyncCaptureRecord } from './guards';
import { applyCatalogDeletionNative } from './apply-deletion';
import { applyPreparedMediaReplica, type ApplyPreparedMediaReplicaInput } from './apply-media';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: vi.fn().mockResolvedValue(undefined),
  listReadyJournals: vi.fn().mockResolvedValue([]),
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
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
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
      (row) => parseSyncCaptureRecord(row)?.kind === 'sync-operation'
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

it('refuses mismatched metadata and incomplete nonzero predecessor admission', async () => {
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

function successor(input: ApplyPreparedMediaReplicaInput, generation = 1) {
  const next = structuredClone(input);
  next.expectedLocalGeneration = generation;
  next.expectedBasis = [input.operationId];
  next.operationId = `${input.operationId}-next`;
  next.sourceDigest = 'd'.repeat(64);
  next.rows.ref.assetId = `${input.rows.ref.assetId}-next`;
  next.rows.ref.location = { kind: 'opfs', objectKey: `objects/${next.rows.ref.assetId}` };
  next.rows.projectAsset.assetId = next.rows.ref.assetId;
  return next;
}

it('replaces an admitted original and retains old bytes shared by another canonical owner', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const shared = {
    assetId: f.input.rows.ref.assetId,
    ownerKind: 'project-asset',
    ownerId: 'other',
    role: 'body',
  };
  f.table('asset_owners').set(JSON.stringify(['project-asset', 'other', 'body']), shared);
  const next = successor(f.input);
  await expect(applyPreparedMediaReplica(next)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(f.table('project_assets').get('source')).toEqual(next.rows.projectAsset);
  expect(f.table('asset_refs').get(f.input.rows.ref.assetId)).toEqual(f.input.rows.ref);
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
    generation: 2,
    basis: [next.operationId],
  });
});

it('refuses a competing update after the first causal revision commits', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const first = successor(f.input);
  const competing = { ...first, operationId: 'competing' };
  await applyPreparedMediaReplica(first);
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(competing)).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it.each(['deletion', 'restore', 'recreation', 'basis', 'enrollment'])(
  'refuses a delayed update after native %s',
  async (change) => {
    const f = setup();
    await applyPreparedMediaReplica(f.input);
    const next = successor(f.input);
    if (change === 'deletion') f.table('media_library').delete(f.input.rows.media.id);
    if (change === 'restore' || change === 'recreation') {
      const state = parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey));
      if (!state || state.kind !== 'root-state') throw new Error('Missing state');
      f.table('sync_capture').set(f.stateKey, { ...state, generation: 3 });
    }
    if (change === 'basis') next.expectedBasis = ['outside-selected-ancestry'];
    if (change === 'enrollment') next.profileCreatedAt = 2;
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(next)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('rolls back a refused causal update and permits exact retry', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const next = successor(f.input);
  const before = structuredClone(f.rows);
  f.failReceipt();
  await expect(applyPreparedMediaReplica(next)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.allowWrites();
  await expect(applyPreparedMediaReplica(next)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
});

it('replays a receipt after a later revision without replacing the source', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  await applyPreparedMediaReplica(successor(f.input));
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(f.rows).toEqual(before);
});

it('refuses a changed native source even when generation and basis still match', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  f.table('media_library').set(f.input.rows.media.id, {
    ...f.input.rows.media,
    filename: 'local edit.png',
  });
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(successor(f.input))).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it.each(['native', 'published'] as const)(
  'keeps pending local media changes as conflicts: %s',
  async (phase) => {
    const f = setup();
    await applyPreparedMediaReplica(f.input);
    const capture = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: 'local-change',
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: f.input.rows.media.id,
      rootKey: f.rootKey,
      generation: 1,
      operationId: 'local-change',
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'media', rows: f.input.rows },
    });
    const { change: _change, phase: _phase, ...header } = capture;
    f.table('sync_capture').set(
      capture.key,
      phase === 'native'
        ? capture
        : {
            ...header,
            phase: 'published',
            publication: {
              kind: 'verified',
              acceptedAt: 2,
              preparedSha256: 'a'.repeat(64),
              attemptId: '11111111-1111-4111-8111-111111111111',
              recordKey: 'records/local.json',
              recordSha256: 'a'.repeat(64),
            },
            objects: [],
          }
    );
    const before = structuredClone(f.rows);
    if (phase === 'published')
      await expect(applyPreparedMediaReplica(successor(f.input))).resolves.toMatchObject({
        status: 'applied',
      });
    else {
      await expect(applyPreparedMediaReplica(successor(f.input))).rejects.toThrow('source-changed');
      expect(f.rows).toEqual(before);
    }
  }
);

it('refuses replacement while a dependent project retains the original source identity', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const project = createVideoProjectEntryWithMediaClip({ id: 'dependent' });
  project.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.input.rows.media.id };
  f.table('video_projects').set(project.id, project);
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(successor(f.input))).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it.each(['space', 'enrollment'] as const)(
  'refuses first import into a different %s lifetime',
  async (change) => {
    const f = setup();
    const candidate = {
      ...f.input,
      ...(change === 'space' ? { spaceId: 'another-space' } : { profileCreatedAt: 2 }),
    };
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(candidate)).rejects.toThrow('profile-changed');
    expect(f.rows).toEqual(before);
  }
);

it('refuses an absent live media predecessor without an explicit graveyard', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  f.table('media_library').delete(f.input.rows.media.id);
  f.table('project_assets').delete('source');
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(successor(f.input))).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it.each(['legacy', 'child', 'sidecar', 'physical-ref', 'pending'] as const)(
  'refuses restoring a deleted media source with conflicting %s evidence',
  async (change) => {
    const f = setup();
    await applyPreparedMediaReplica(f.input);
    await applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: f.input.rows.media.id,
      operationId: 'delete',
      sourceDigest: 'e'.repeat(64),
      spaceId: f.input.spaceId,
      profileCreatedAt: f.input.profileCreatedAt,
      connectionGeneration: f.input.connectionGeneration,
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedWorkspaceRevision: null,
    });
    const restore = successor(f.input, 2);
    restore.expectedBasis = ['delete'];
    if (change === 'legacy') {
      const state = parseSyncCaptureRecord(f.table('sync_capture').get(f.stateKey));
      if (!state || state.kind !== 'root-state') throw new Error('Missing graveyard');
      const { deleted: _deleted, ...legacy } = state;
      f.table('sync_capture').set(f.stateKey, legacy);
    }
    if (change === 'child') f.table('project_assets').set('source', f.input.rows.projectAsset);
    if (change === 'sidecar')
      f.table('image_workspaces').set(f.input.rows.media.id, { authored: true });
    if (change === 'physical-ref')
      f.table('asset_refs').set(restore.rows.ref.assetId, { ...restore.rows.ref, size: 99 });
    if (change === 'pending')
      f.table('sync_capture').set(
        'pending',
        createNativeCapture({
          version: 1,
          kind: 'sync-operation',
          key: 'pending',
          createdAt: 1,
          spaceId: f.input.spaceId,
          connectionGeneration: f.input.connectionGeneration,
          rootKind: 'media',
          rootId: f.input.rows.media.id,
          rootKey: f.rootKey,
          generation: 2,
          operationId: 'pending',
          basis: ['delete'],
          origin: 'local-edit',
          publicationId: null,
          change: { kind: 'tombstone' },
        })
      );
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(restore)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);
