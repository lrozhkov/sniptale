import { initDB } from '../infrastructure/indexed-db/core';

import { beforeEach, expect, it, vi } from 'vitest';

import { createProjectExportEntry } from '../projects/index.test-support';

import { collectSyncCaptureClaims } from './claims';
import { captureMediaInTransaction } from './capture';

import { applyCatalogDeletionNative } from './apply-deletion';
import {
  applyPreparedMediaReplica,
  loadMediaReplicaPredecessorRef,
  type ApplyPreparedMediaReplicaInput,
} from './apply-media';

import { createMediaReplicaFixture } from './test-support/apply-media';

const io = vi.hoisted(() => ({ database: vi.fn(), read: vi.fn() }));
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
beforeEach(() => vi.clearAllMocks());

function setup() {
  const fixture = createMediaReplicaFixture();
  io.database.mockResolvedValue(fixture.database);
  return fixture;
}

function exportInput(
  input: ApplyPreparedMediaReplicaInput,
  mimeType = 'video/webm'
): ApplyPreparedMediaReplicaInput {
  const ref = { ...input.rows.ref, mimeType };
  const projectExport = createProjectExportEntry({
    id: 'standalone',
    projectId: 'absent-parent',
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  const media = {
    ...input.rows.media,
    id: `export:${projectExport.id}`,
    kind: 'export' as const,
    source: {
      kind: 'project-export' as const,
      exportId: projectExport.id,
      projectId: projectExport.projectId,
    },
    mimeType: ref.mimeType,
  };
  return { ...input, rows: { media, ref, projectExport } };
}

it.each(['video/webm', 'image/png'])(
  'publishes an independent %s export without its parent project and pins its accepted original',
  async (mimeType) => {
    const f = setup();
    const input = exportInput(f.input, mimeType);
    await expect(applyPreparedMediaReplica(input)).resolves.toEqual({
      status: 'applied',
      generation: 1,
    });
    expect(f.table('project_exports').get('standalone')).toEqual(
      'projectExport' in input.rows ? input.rows.projectExport : null
    );
    expect(f.table('video_projects').has('absent-parent')).toBe(false);
    expect(
      await loadMediaReplicaPredecessorRef({
        spaceId: 'space',
        profileCreatedAt: 1,
        connectionGeneration: 3,
        mediaId: input.rows.media.id,
        expectedLocalGeneration: 1,
        expectedBasis: [input.operationId],
      })
    ).toEqual(input.rows.ref);
    const tx = (await initDB()).transaction([...f.rows.keys()], 'readwrite');
    const captured = await captureMediaInTransaction(tx, input.rows.media.id);
    await tx.done;
    expect(captured).toMatchObject({
      change: { kind: 'media', rows: { projectExport: { id: 'standalone' } } },
    });
    expect(collectSyncCaptureClaims([captured]).assetIds).toEqual(
      new Set([input.rows.ref.assetId])
    );
  }
);

it('keeps independent export generations through refusal, parallel successors, delete and recreation', async () => {
  const f = setup();
  const input = exportInput(f.input);
  f.failReceipt();
  const initial = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(input)).rejects.toThrow();
  expect(f.rows).toEqual(initial);
  f.allowWrites();
  await applyPreparedMediaReplica(input);
  const next = {
    ...input,
    operationId: 'export-next',
    expectedLocalGeneration: 1,
    expectedBasis: [input.operationId],
  };
  let release!: () => void;
  io.database.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const competing = applyPreparedMediaReplica({ ...next, operationId: 'competing-export' });
  await applyPreparedMediaReplica(next);
  const before = structuredClone(f.rows);
  release();
  await expect(competing).rejects.toThrow();
  expect(f.rows).toEqual(before);
  await applyCatalogDeletionNative({
    rootKind: 'media',
    rootId: input.rows.media.id,
    operationId: 'delete-export',
    sourceDigest: 'd'.repeat(64),
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedLocalGeneration: 2,
    expectedBasis: ['export-next'],
    expectedWorkspaceRevision: null,
  });
  await applyPreparedMediaReplica({
    ...input,
    operationId: 'recreate-export',
    expectedLocalGeneration: 3,
    expectedBasis: ['delete-export'],
  });
  const recreated = structuredClone(f.rows);
  await expect(
    applyPreparedMediaReplica({ ...next, operationId: 'late-export' })
  ).rejects.toThrow();
  expect(f.rows).toEqual(recreated);
  await expect(applyPreparedMediaReplica(input)).resolves.toMatchObject({
    status: 'duplicate',
    generation: 1,
  });
});

it('refuses a tombstone for an absent Library row while its native export still owns the original', async () => {
  const f = setup();
  const input = exportInput(f.input);
  if (!('projectExport' in input.rows)) throw new Error('Missing export fixture');
  const exported = input.rows.projectExport;
  f.table('project_exports').set(exported.id, exported);
  f.table('asset_refs').set(input.rows.ref.assetId, input.rows.ref);
  const owner = {
    ownerKind: 'project-export',
    ownerId: exported.id,
    role: 'body',
    assetId: exported.assetId,
  };
  f.table('asset_owners').set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  const before = structuredClone(f.rows);
  await expect(
    applyCatalogDeletionNative({
      rootKind: 'media',
      rootId: input.rows.media.id,
      operationId: 'unseen-export-deletion',
      sourceDigest: 'e'.repeat(64),
      spaceId: input.spaceId,
      profileCreatedAt: input.profileCreatedAt,
      connectionGeneration: input.connectionGeneration,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

function retainedExport() {
  const f = setup();
  const input = exportInput(f.input);
  if (!('projectExport' in input.rows)) throw new Error('Expected export.');
  const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
  input.authorization = authorization;
  const binding = {
    provider: 'webdav',
    rootUrl: 'https://dav.example.test/root/',
    accountId: 'alice',
    spaceId: input.spaceId,
    profileCreatedAt: input.profileCreatedAt,
    connectionGeneration: input.connectionGeneration,
  };
  f.table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  });
  f.table('project_exports').set(input.rows.projectExport.id, input.rows.projectExport);
  f.table('asset_refs').set(input.rows.ref.assetId, input.rows.ref);
  f.table('asset_owners').set(
    JSON.stringify(['project-export', input.rows.projectExport.id, 'body']),
    {
      assetId: input.rows.ref.assetId,
      ownerKind: 'project-export',
      ownerId: input.rows.projectExport.id,
      role: 'body',
    }
  );
  const copyId = JSON.stringify(['copy', 'opfs', input.rows.ref.assetId]);
  f.table('asset_residency').set(copyId, {
    version: 1,
    kind: 'copy',
    id: copyId,
    revision: 1,
    operationId: 'parent-project-operation',
    phase: 'unloaded',
    target: { kind: 'opfs', ref: input.rows.ref },
    remote: { binding, key: 'Files/project/export.webm', sha256: input.rows.ref.sha256 },
    lastUsedAt: 1,
  });
  return {
    ...f,
    input,
    copyId,
    lookup: {
      ...input,
      mediaId: input.rows.media.id,
      exportSource: {
        projectId: input.rows.projectExport.projectId,
        sha256: input.rows.ref.sha256!,
      },
    },
  };
}

it('enrolls a project-retained export under the same original identity and replays its receipt', async () => {
  const f = retainedExport();
  expect(await loadMediaReplicaPredecessorRef(f.lookup)).toEqual(f.input.rows.ref);
  const sidecar = { retained: true };
  f.table('thumbnails').set(f.input.rows.media.id, sidecar);
  f.failReceipt();
  const before = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allowWrites();
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({
    status: 'applied',
    generation: 1,
  });
  expect(f.table('asset_refs').size).toBe(1);
  expect(f.table('asset_refs').get(f.input.rows.ref.assetId)).toEqual(f.input.rows.ref);
  expect(f.table('thumbnails').get(f.input.rows.media.id)).toEqual(sidecar);
  const committed = structuredClone(f.rows);
  await expect(applyPreparedMediaReplica(f.input)).resolves.toMatchObject({ status: 'duplicate' });
  expect(f.rows).toEqual(committed);
});

it.each(['owner', 'ref', 'copy', 'tombstone', 'replacement-ref'] as const)(
  'refuses changed retained-export %s between lookup and independent publication',
  async (change) => {
    const f = retainedExport();
    expect(await loadMediaReplicaPredecessorRef(f.lookup)).toEqual(f.input.rows.ref);
    if (change === 'owner' && 'projectExport' in f.input.rows)
      f.table('asset_owners').delete(
        JSON.stringify(['project-export', f.input.rows.projectExport.id, 'body'])
      );
    if (change === 'ref')
      f.table('asset_refs').set(f.input.rows.ref.assetId, { ...f.input.rows.ref, createdAt: 2 });
    if (change === 'copy') f.table('asset_residency').delete(f.copyId);
    if (change === 'replacement-ref')
      f.input.rows.ref = {
        ...f.input.rows.ref,
        assetId: 'replacement',
        location: { kind: 'opfs', objectKey: 'objects/replacement' },
      };
    if (change === 'tombstone') {
      const rootKey = JSON.stringify([f.input.spaceId, 'media', f.input.rows.media.id]);
      const key = JSON.stringify(['root-state', rootKey]);
      f.table('sync_capture').set(key, {
        version: 1,
        kind: 'root-state',
        key,
        createdAt: 1,
        spaceId: f.input.spaceId,
        rootKind: 'media',
        rootId: f.input.rows.media.id,
        rootKey,
        generation: 1,
        basis: ['deleted-export'],
        deleted: true,
      });
    }
    const before = structuredClone(f.rows);
    await expect(applyPreparedMediaReplica(f.input)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);
