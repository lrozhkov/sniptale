import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { preparedOutgoingOperationKey } from './outgoing';
import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { applyPreparedMediaReplica, type ApplyPreparedMediaReplicaInput } from './apply-media';
import {
  loadCatalogReplicaAdmission,
  loadCatalogNativeBases,
  hasCatalogReplicaReceipt,
  loadMaterializedCatalogSelections,
} from './catalog-admission';
import { parseSyncCaptureRecord } from './guards';
import { captureRootKey } from './contracts';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => vi.clearAllMocks());
const scope = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 3 };
const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
function setup() {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
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
  const connection = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  };
  table('sync_connection').set('connection', connection);
  const ref = {
    assetId: 'source-body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source-body' },
    mimeType: 'video/webm',
    size: 6,
    sha256: 'b'.repeat(64),
  };
  const input: ApplyPreparedMediaReplicaInput = {
    ...scope,
    authorization,
    operationId: 'source-operation',
    sourceDigest: 'a'.repeat(64),
    expectedLocalGeneration: 0,
    expectedBasis: [],
    rows: {
      media: createMediaLibraryEntry({
        id: 'project-asset:source',
        source: { kind: 'project-asset', projectAssetId: 'source' },
        mimeType: ref.mimeType,
        size: ref.size,
        lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
      }),
      projectAsset: {
        id: 'source',
        assetId: ref.assetId,
        mimeType: ref.mimeType,
        size: ref.size,
        createdAt: 1,
      },
      ref,
    },
  };
  const args = {
    scope,
    authorization,
    rootKind: 'video-project' as const,
    rootId: 'parent',
    dependencyMediaIds: ['project-asset:source'],
  };
  return { ...fixture, table, connection, input, args };
}

it('derives target admission and original refs only after committed dependency publication', async () => {
  const f = setup();
  await expect(loadCatalogReplicaAdmission(f.args)).rejects.toThrow('admission refused');
  await applyPreparedMediaReplica(f.input);
  const result = await loadCatalogReplicaAdmission(f.args);
  expect(result).toEqual({
    ...scope,
    authorization,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [
      {
        entry: { ...f.input.rows.media, imageContentState: 'original', workspaceRevision: 0 },
        ref: f.input.rows.ref,
        expectedGeneration: 1,
        expectedBasis: ['source-operation'],
      },
    ],
  });
  expect(
    await hasCatalogReplicaReceipt({
      scope,
      rootKind: 'media',
      rootId: f.input.rows.media.id,
      operationId: f.input.operationId,
      sourceDigest: f.input.sourceDigest,
    })
  ).toBe(true);
});

it('refuses revoked authorization and malformed native state instead of supplying new-root counters', async () => {
  const f = setup();
  f.table('sync_connection').set('connection', {
    ...f.connection,
    identity: { ...authorization, revision: 2 },
    phase: 'paused',
  });
  await expect(loadCatalogReplicaAdmission({ ...f.args, dependencyMediaIds: [] })).rejects.toThrow(
    'admission refused'
  );
  f.table('sync_connection').set('connection', f.connection);
  const rootKey = captureRootKey(scope.spaceId, 'video-project', 'parent');
  f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), { kind: 'broken-state' });
  await expect(loadCatalogReplicaAdmission({ ...f.args, dependencyMediaIds: [] })).rejects.toThrow(
    'admission refused'
  );
});

it('refuses a delayed publication after revocation before database admission settles', async () => {
  const f = setup();
  let release!: (value: typeof f.database) => void;
  const gate = new Promise<typeof f.database>((resolve) => {
    release = resolve;
  });
  io.database.mockReturnValueOnce(gate);
  const delayed = applyPreparedMediaReplica(f.input);
  f.table('sync_connection').set('connection', {
    ...f.connection,
    identity: { ...authorization, revision: 2 },
    phase: 'paused',
  });
  const before = structuredClone(f.rows);
  release(f.database);
  await expect(delayed).rejects.toThrow('admission refused');
  expect(f.rows).toEqual(before);
});

it('refuses a local edit between admission and native publication', async () => {
  const f = setup();
  const admission = await loadCatalogReplicaAdmission({
    ...f.args,
    rootKind: 'media',
    rootId: f.input.rows.media.id,
    dependencyMediaIds: [],
  });
  await applyPreparedMediaReplica({ ...f.input, operationId: 'local-first' });
  const before = structuredClone(f.rows);
  await expect(
    applyPreparedMediaReplica({ ...f.input, ...admission, operationId: 'delayed-remote' })
  ).rejects.toThrow('source-changed');
  expect(f.rows).toEqual(before);
});

it('matches materialized selections by generation and receipt without reading bytes', async () => {
  const f = setup();
  const selection = {
    rootKind: 'media' as const,
    rootId: f.input.rows.media.id,
    operationId: f.input.operationId,
    sourceDigest: f.input.sourceDigest,
  };
  await expect(
    loadMaterializedCatalogSelections({ scope, selections: [selection] })
  ).resolves.toEqual([]);
  await applyPreparedMediaReplica(f.input);
  f.table('asset_refs').clear();
  const observe = vi.spyOn(f.database, 'transaction');
  const before = structuredClone(f.rows);
  await expect(
    loadMaterializedCatalogSelections({ scope, selections: [selection] })
  ).resolves.toEqual([selection]);
  expect(observe).toHaveBeenCalledWith(['sync_capture', 'sync_outbox'], 'readonly');
  expect(observe).toHaveBeenCalledTimes(1);
  expect(f.rows).toEqual(before);
});

it.each([
  'local-basis',
  'recreated-generation',
  'deleted',
  'wrong-digest',
  'unrelated-root',
  'missing-receipt',
] as const)('does not match materialized selection after %s', async (change) => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const selection = {
    rootKind: 'media' as const,
    rootId: f.input.rows.media.id,
    operationId: f.input.operationId,
    sourceDigest: f.input.sourceDigest,
  };
  const rootKey = captureRootKey(scope.spaceId, 'media', selection.rootId);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const receiptKey = JSON.stringify(['applied-operation', scope.spaceId, selection.operationId]);
  const state = parseSyncCaptureRecord(f.table('sync_capture').get(stateKey));
  const receipt = parseSyncCaptureRecord(f.table('sync_capture').get(receiptKey));
  if (!state || state.kind !== 'root-state' || !receipt || receipt.kind !== 'applied-operation')
    throw new Error('Missing committed native fixture');
  if (change === 'local-basis')
    f.table('sync_capture').set(stateKey, { ...state, basis: ['local-edit'] });
  else if (change === 'recreated-generation')
    f.table('sync_capture').set(stateKey, { ...state, generation: state.generation + 2 });
  else if (change === 'deleted') {
    const graveyard = { ...state, deleted: true };
    delete graveyard.nativeDigest;
    f.table('sync_capture').set(stateKey, graveyard);
  } else if (change === 'wrong-digest') selection.sourceDigest = 'd'.repeat(64);
  else if (change === 'unrelated-root')
    f.table('sync_capture').set(receiptKey, {
      ...receipt,
      rootKey: captureRootKey(scope.spaceId, 'media', 'unrelated'),
    });
  else f.table('sync_capture').delete(receiptKey);
  await expect(
    loadMaterializedCatalogSelections({ scope, selections: [selection] })
  ).resolves.toEqual([]);
});

it.each(['space', 'created-at', 'connection-generation', 'disabled', 'missing'] as const)(
  'does not reuse materialized bindings across a changed profile: %s',
  async (change) => {
    const f = setup();
    await applyPreparedMediaReplica(f.input);
    const profile = parseSyncCaptureRecord(f.table('sync_capture').get('profile'));
    if (!profile || profile.kind !== 'profile') throw new Error('Missing native profile fixture');
    if (change === 'missing') f.table('sync_capture').delete('profile');
    else
      f.table('sync_capture').set('profile', {
        ...profile,
        ...(change === 'space' ? { spaceId: 'other-space' } : {}),
        ...(change === 'created-at' ? { createdAt: profile.createdAt + 1 } : {}),
        ...(change === 'connection-generation'
          ? { connectionGeneration: profile.connectionGeneration + 1 }
          : {}),
        ...(change === 'disabled' ? { enabled: false } : {}),
      });
    await expect(
      loadMaterializedCatalogSelections({
        scope,
        selections: [
          {
            rootKind: 'media',
            rootId: f.input.rows.media.id,
            operationId: f.input.operationId,
            sourceDigest: f.input.sourceDigest,
          },
        ],
      })
    ).resolves.toEqual([]);
  }
);

it('refuses malformed native materialization evidence and oversized selection lists without writing', async () => {
  const f = setup();
  await applyPreparedMediaReplica(f.input);
  const selection = {
    rootKind: 'media' as const,
    rootId: f.input.rows.media.id,
    operationId: f.input.operationId,
    sourceDigest: f.input.sourceDigest,
  };
  const receiptKey = JSON.stringify(['applied-operation', scope.spaceId, selection.operationId]);
  f.table('sync_capture').set(receiptKey, { kind: 'malformed-receipt' });
  const before = structuredClone(f.rows);
  await expect(
    loadMaterializedCatalogSelections({ scope, selections: [selection] })
  ).rejects.toThrow('admission refused');
  await expect(
    loadMaterializedCatalogSelections({
      scope,
      selections: Array.from({ length: 10_001 }, () => selection),
    })
  ).rejects.toThrow('admission refused');
  expect(f.rows).toEqual(before);
});

it('reads only causal metadata for materialized roots and leaves remote-only roots absent', async () => {
  const f = setup();
  const rootId = f.input.rows.media.id;
  const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
  const state = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: scope.spaceId,
    rootKind: 'media',
    rootId,
    rootKey,
    generation: 7,
    basis: ['retained-head'],
  };
  f.table('sync_capture').set(state.key, state);
  // Metadata discovery must not depend on an admissible heavy native source or resident files.
  f.table('media_library').set(rootId, { invalid: 'native source must not be read' });
  f.table('asset_refs').clear();
  f.table('asset_owners').clear();
  const observe = vi.spyOn(f.database, 'transaction');
  const before = structuredClone(f.rows);
  const supplied = {
    scope: structuredClone(scope),
    authorization: structuredClone(authorization),
    roots: [
      { rootKind: 'media' as const, rootId },
      { rootKind: 'media' as const, rootId: 'remote-only' },
    ],
  };
  const pending = loadCatalogNativeBases(supplied);
  supplied.roots[0]!.rootId = 'changed-after-call';
  expect(await pending).toEqual([
    { rootKind: 'media', rootId, generation: 7, basis: ['retained-head'] },
  ]);
  expect(observe).toHaveBeenCalledExactlyOnceWith(['sync_capture', 'sync_connection'], 'readonly');
  expect(f.rows).toEqual(before);
});

it('reads ten thousand remote-only native keys without touching source or original stores', async () => {
  const f = setup();
  const roots = Array.from({ length: 10_000 }, (_, index) => ({
    rootKind: 'media' as const,
    rootId: `remote-${index}`,
  }));
  const observe = vi.spyOn(f.database, 'transaction');
  const before = structuredClone(f.rows);
  expect(await loadCatalogNativeBases({ scope, authorization, roots })).toEqual([]);
  expect(observe).toHaveBeenCalledExactlyOnceWith(['sync_capture', 'sync_connection'], 'readonly');
  expect(f.rows).toEqual(before);
});

it.each([
  'space',
  'profile-time',
  'generation',
  'disabled',
  'missing-profile',
  'authorization',
  'paused',
] as const)('refuses native causal discovery after %s authority changes', async (kind) => {
  const f = setup();
  const profile = parseSyncCaptureRecord(f.table('sync_capture').get('profile'));
  if (!profile || profile.kind !== 'profile') throw new Error('Missing capture profile');
  if (kind === 'space')
    f.table('sync_capture').set('profile', { ...profile, spaceId: 'replacement-space' });
  if (kind === 'profile-time') f.table('sync_capture').set('profile', { ...profile, createdAt: 2 });
  if (kind === 'generation')
    f.table('sync_capture').set('profile', { ...profile, connectionGeneration: 4 });
  if (kind === 'disabled') f.table('sync_capture').set('profile', { ...profile, enabled: false });
  if (kind === 'missing-profile') f.table('sync_capture').delete('profile');
  if (kind === 'authorization')
    f.table('sync_connection').set('connection', {
      ...f.connection,
      identity: { ...authorization, revision: 2 },
    });
  if (kind === 'paused')
    f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
  const before = structuredClone(f.rows);
  await expect(
    loadCatalogNativeBases({
      scope,
      authorization,
      roots: [{ rootKind: 'media', rootId: f.input.rows.media.id }],
    })
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('refuses malformed retained root state rather than returning new-root ordering', async () => {
  const f = setup();
  const rootId = f.input.rows.media.id;
  const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
  f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), { kind: 'broken-state' });
  const before = structuredClone(f.rows);
  await expect(
    loadCatalogNativeBases({ scope, authorization, roots: [{ rootKind: 'media', rootId }] })
  ).rejects.toThrow('admission refused');
  expect(f.rows).toEqual(before);
});

it('rejects duplicate or excessive root discovery before opening native storage', async () => {
  const f = setup();
  const root = { rootKind: 'media' as const, rootId: f.input.rows.media.id };
  await expect(
    loadCatalogNativeBases({ scope, authorization, roots: [root, root] })
  ).rejects.toThrow();
  await expect(
    loadCatalogNativeBases({
      scope,
      authorization,
      roots: Array.from({ length: 10_001 }, (_, index) => ({ ...root, rootId: `root-${index}` })),
    })
  ).rejects.toThrow();
  expect(io.database).not.toHaveBeenCalled();
});

it('rechecks authorization after a delayed native metadata database admission', async () => {
  const f = setup();
  let release!: (value: typeof f.database) => void;
  const database = new Promise<typeof f.database>((resolve) => {
    release = resolve;
  });
  io.database.mockReturnValueOnce(database);
  const pending = loadCatalogNativeBases({
    scope,
    authorization,
    roots: [{ rootKind: 'media', rootId: f.input.rows.media.id }],
  });
  const refused = expect(pending).rejects.toThrow();
  f.table('sync_connection').set('connection', {
    ...f.connection,
    phase: 'paused',
    identity: { ...authorization, revision: 2 },
  });
  const before = structuredClone(f.rows);
  release(f.database);
  await refused;
  expect(f.rows).toEqual(before);
});

it.each([
  'current',
  'digest',
  'generation',
  'profile',
  'enrollment',
  'missing-locator',
  'unpublished',
] as const)(
  'matches a locally authored head only through its exact accepted publication: %s',
  async (change) => {
    const f = setup();
    const rootId = f.input.rows.media.id;
    const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
    const native = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: 'local-capture',
      createdAt: 1,
      spaceId: scope.spaceId,
      connectionGeneration: scope.connectionGeneration,
      rootKind: 'media',
      rootId,
      rootKey,
      operationId: 'local-operation',
      generation: 1,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'media', rows: f.input.rows },
    });
    const { change: _change, phase: _phase, ...header } = native;
    const published = {
      ...header,
      phase: 'published',
      publication: {
        kind: 'verified',
        acceptedAt: 1,
        preparedSha256: 'a'.repeat(64),
        attemptId: authorization.incarnation,
        recordKey: '.sniptale/changes/accepted.json',
        recordSha256: 'b'.repeat(64),
      },
      objects: [],
    };
    const selection = {
      rootKind: 'media' as const,
      rootId,
      operationId: native.operationId,
      sourceDigest: 'a'.repeat(64),
    };
    const stateKey = JSON.stringify(['root-state', rootKey]);
    f.table('sync_capture').set(stateKey, {
      version: 1,
      kind: 'root-state',
      key: stateKey,
      createdAt: 1,
      spaceId: scope.spaceId,
      rootKind: 'media',
      rootId,
      rootKey,
      generation: 1,
      basis: [native.operationId],
    });
    if (change === 'digest') selection.sourceDigest = 'c'.repeat(64);
    if (change === 'generation') published.generation += 1;
    if (change === 'profile') published.profileCreatedAt += 1;
    if (change === 'enrollment') published.connectionGeneration += 1;
    expect(parseSyncCaptureRecord(published)?.kind).toBe('sync-operation');
    f.table('sync_capture').set(native.key, change === 'unpublished' ? native : published);
    const locatorKey = preparedOutgoingOperationKey(scope.spaceId, native.operationId);
    if (change !== 'missing-locator')
      f.table('sync_outbox').set(locatorKey, {
        kind: 'operation-locator',
        key: locatorKey,
        spaceId: scope.spaceId,
        operationId: native.operationId,
        captureKey: native.key,
        sourceSha256: native.sourceSha256,
        connectionGeneration: published.connectionGeneration,
        profileCreatedAt: published.profileCreatedAt,
      });
    const before = structuredClone(f.rows);
    await expect(
      loadMaterializedCatalogSelections({ scope, selections: [selection] })
    ).resolves.toEqual(change === 'current' ? [selection] : []);
    expect(f.rows).toEqual(before);
  }
);
