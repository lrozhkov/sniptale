import {
  installPersistenceLockManagerForTests,
  runWithPersistenceMutationTransition,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores';
import { assetResidencyCopyId, parseAssetResidencyRecord } from './residency-records';
import type { AssetRef } from './contracts';
import type { PublishedCaptureOperation } from '../sync-capture/contracts';
import {
  unloadVerifiedAssetObject,
  restoreVerifiedAssetObject,
  type VerifiedAssetUnload,
} from './residency-maintenance';
import { createHarness, MemoryDirectoryHandle } from './opfs-store.test-support';
import { readAssetFile, ASSET_ROOT_DIRECTORY_NAME } from './opfs-store';

const io = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
beforeEach(() => {
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture() {
  let failWrites = false;
  const memory = createReviewWorkspaceStoreFixture(
    (name) => failWrites && name === 'asset_residency'
  );
  memory.rows.clear();
  for (const name of EXPECTED_STORES) memory.rows.set(name, new Map());
  const db = {
    ...memory.database,
    getAll: async (name: string) => structuredClone([...(memory.rows.get(name)?.values() ?? [])]),
  };
  io.db.mockResolvedValue(db);
  const table = (name: string) => memory.rows.get(name)!;
  const ref: AssetRef = {
    assetId: 'original',
    createdAt: 1,
    size: 3,
    mimeType: 'image/png',
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/original' },
  };
  const media = createMediaLibraryEntry({
    id: 'native-image',
    source: { kind: 'stored-asset', assetId: ref.assetId },
    size: ref.size,
  });
  const owner = {
    assetId: ref.assetId,
    ownerKind: 'media-library',
    ownerId: media.id,
    role: 'source',
  };
  table('asset_refs').set(ref.assetId, ref);
  table('asset_owners').set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  table('media_library').set(media.id, media);
  const binding = {
    provider: 'webdav' as const,
    rootUrl: 'https://dav.example.test/root/',
    accountId: 'alice',
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 1,
  };
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  });
  const input: VerifiedAssetUnload = {
    draft: {
      operationId: 'unload-1',
      target: { kind: 'opfs', ref },
      remote: {
        binding,
        key: 'Originals/attempt/original.png',
        sha256: createHash('sha256').update('abc').digest('hex'),
      },
      lastUsedAt: 5,
    },
    expectedRevision: null,
    authorization,
  };
  const harness = createHarness();
  const root = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  const ready = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, root);
  root.entriesByName.set('objects', objects);
  root.entriesByName.set('writing', writing);
  root.entriesByName.set('ready', ready);
  const file = await objects.getFileHandle(ref.assetId, { create: true });
  const stream = await file.createWritable();
  await stream.write('abc');
  await stream.close();
  const publication: PublishedCaptureOperation = {
    version: 1,
    kind: 'sync-operation',
    phase: 'published',
    key: '["change","operation"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    profileCreatedAt: 1,
    rootKind: 'media',
    rootId: media.id,
    rootKey: JSON.stringify(['space', 'media', media.id]),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    sourceSha256: 'b'.repeat(64),
    source: { changeKind: 'media', label: 'original.png' },
    publication: {
      kind: 'verified',
      acceptedAt: 2,
      preparedSha256: 'c'.repeat(64),
      attemptId: '11111111-1111-4111-8111-111111111111',
      recordKey: 'records/manifest.json',
      recordSha256: 'd'.repeat(64),
    },
    objects: [
      {
        objectId: 'body',
        ref,
        filename: 'original.png',
        sha256: createHash('sha256').update('abc').digest('hex'),
        remoteKey: input.draft.remote.key,
        pinned: true,
      },
    ],
  };
  table('sync_capture').set(publication.key, publication);
  const unload = () => unloadVerifiedAssetObject(input, harness.options);
  const bytes = async () => (await readAssetFile(ref, 'original.png', harness.options)).text();
  return {
    ...memory,
    ...harness,
    table,
    ref,
    media,
    owner,
    input,
    objects,
    writing,
    ready,
    publication,
    unload,
    bytes,
    failWrites: () => {
      failWrites = true;
    },
    allowWrites: () => {
      failWrites = false;
    },
  };
}

it('unloads owned bytes while preserving native rows and compact publication facts', async () => {
  const f = await fixture();
  const before = structuredClone([
    f.table('asset_refs'),
    f.table('asset_owners'),
    f.table('media_library'),
  ]);
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
  expect(f.objects.entriesByName.has(f.ref.assetId)).toBe(false);
  expect([f.table('asset_refs'), f.table('asset_owners'), f.table('media_library')]).toEqual(
    before
  );
  expect(f.table('sync_capture').get(f.publication.key)).toEqual({
    ...f.publication,
    objects: f.publication.objects.map((object) => ({ ...object, pinned: false })),
  });
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
});

it('retains exact intent after deletion refusal and completes the same command on retry', async () => {
  const f = await fixture();
  f.objects.removeEffect = async () => {
    throw new DOMException('Locked', 'NoModificationAllowedError');
  };
  await expect(f.unload()).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').get(assetResidencyCopyId(f.input.draft.target))).toMatchObject({
    phase: 'unloading',
    revision: 1,
  });
  f.objects.removeEffect = async () => undefined;
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
});

it('retains intent after lost settlement and retries without recreating or adopting bytes', async () => {
  const f = await fixture();
  f.objects.removeEffect = async () => {
    f.failWrites();
  };
  await expect(f.unload()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(f.objects.entriesByName.has(f.ref.assetId)).toBe(false);
  expect(f.table('asset_residency').get(assetResidencyCopyId(f.input.draft.target))).toMatchObject({
    phase: 'unloading',
  });
  f.allowWrites();
  f.objects.removeEffect = async () => undefined;
  expect(await f.unload()).toMatchObject({ phase: 'unloaded', revision: 2 });
});

it('aborts pin release and intent together on quota refusal before deleting bytes', async () => {
  const f = await fixture();
  f.failWrites();
  await expect(f.unload()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
  expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
});

it.each(['ref', 'owner', 'native', 'authorization', 'profile', 'malformed'] as const)(
  'preserves bytes when current %s authority changed',
  async (change) => {
    const f = await fixture();
    if (change === 'ref') f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    if (change === 'owner') f.table('asset_owners').clear();
    if (change === 'native') f.table('media_library').clear();
    if (change === 'authorization') f.table('sync_connection').set('connection', { version: 1 });
    if (change === 'profile') f.table('sync_capture').delete('profile');
    if (change === 'malformed') f.table('sync_capture').set('corrupt', { version: 100 });
    await expect(f.unload()).rejects.toThrow();
    expect(await f.bytes()).toBe('abc');
    expect(f.table('asset_residency').size).toBe(0);
  }
);

it('refuses a current pinned root and preserves its original bytes', async () => {
  const f = await fixture();
  const id = JSON.stringify(['root', 'media', f.media.id]);
  f.table('asset_residency').set(id, {
    version: 1,
    kind: 'root',
    id,
    revision: 1,
    rootKind: 'media',
    rootId: f.media.id,
    pinned: true,
    lastUsedAt: 1,
  });
  await expect(f.unload()).rejects.toThrow('pinned offline');
  expect(await f.bytes()).toBe('abc');
});

it('refuses a writing marker before creating any unload intent', async () => {
  const f = await fixture();
  await f.writing.getFileHandle(f.ref.assetId, { create: true });
  await expect(f.unload()).rejects.toThrow('unfinished publication');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
});

it('returns busy without changing pins or bytes when an active reader holds cleanup', async () => {
  const f = await fixture();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: null) => Promise<unknown>
      ) => callback(null),
    },
  });
  expect(await f.unload()).toBe('busy');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('sync_capture').get(f.publication.key)).toEqual(f.publication);
  expect(f.table('asset_residency').size).toBe(0);
});

it('refuses unfinished portable preparation even when a published copy already exists', async () => {
  const f = await fixture();
  const { publication: _publication, objects, ...header } = f.publication;
  const { remoteKey: _remoteKey, pinned: _pinned, ...object } = objects[0]!;
  f.table('sync_capture').set(header.key, {
    ...header,
    phase: 'prepared',
    prepared: {
      recordText: '{}',
      recordSha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      objects: [object],
    },
  });
  await expect(f.unload()).rejects.toThrow('unfinished capture');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
});

it('refuses a durable ready journal and keeps its original source', async () => {
  const f = await fixture();
  const marker = await f.ready.getFileHandle('pending-publication', { create: true });
  const writable = await marker.createWritable();
  await writable.write(
    JSON.stringify({
      journalId: 'pending-publication',
      createdAt: 1,
      domain: 'image-workspace',
      assetRefs: [f.ref],
      payload: {},
    })
  );
  await writable.close();
  await expect(f.unload()).rejects.toThrow('unfinished publication');
  expect(await f.bytes()).toBe('abc');
});

it('refuses retained rollback claims instead of treating owned bytes as evictable', async () => {
  const f = await fixture();
  f.table('asset_operations').set('restore', {
    kind: 'backup-restore',
    operationId: 'restore',
    createdAt: 1,
    updatedAt: 1,
    status: 'pending',
    obsoleteAssetIds: [f.ref.assetId],
    compensations: [],
  });
  await expect(f.unload()).rejects.toThrow('native source is unavailable');
  expect(await f.bytes()).toBe('abc');
});

it('protects a shared original when a different current native root is pinned', async () => {
  const f = await fixture();
  const borrower = { ...f.media, id: 'borrower' };
  f.table('media_library').set(borrower.id, borrower);
  const owner = { ...f.owner, ownerId: borrower.id };
  f.table('asset_owners').set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  const id = JSON.stringify(['root', 'media', borrower.id]);
  f.table('asset_residency').set(id, {
    version: 1,
    kind: 'root',
    id,
    revision: 1,
    rootKind: 'media',
    rootId: borrower.id,
    pinned: true,
    lastUsedAt: 1,
  });
  await expect(f.unload()).rejects.toThrow('pinned offline');
  expect(await f.bytes()).toBe('abc');
});

it('refuses native deletion and same-ID replacement during a controlled object-lock wait', async () => {
  const f = await fixture();
  let release!: () => void;
  let waiting!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    waiting = resolve;
  });
  f.options.requestExclusiveLock = async (_name, _options, operation) => {
    waiting();
    await gate;
    await operation(true);
  };
  const command = f.unload();
  await started;
  f.table('asset_refs').delete(f.ref.assetId);
  f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
  release();
  await expect(command).rejects.toThrow('native source is unavailable');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
});

it('refuses a delayed competing operation after a previous command committed', async () => {
  const f = await fixture();
  const stale = structuredClone(f.input);
  stale.draft.operationId = 'competing';
  expect(await f.unload()).toMatchObject({ phase: 'unloaded' });
  await expect(unloadVerifiedAssetObject(stale, f.options)).rejects.toThrow('revision is stale');
  expect(f.table('asset_residency').get(assetResidencyCopyId(f.input.draft.target))).toMatchObject({
    operationId: f.input.draft.operationId,
    phase: 'unloaded',
    revision: 2,
  });
});

it('refuses valid authorization revocation during a controlled wait', async () => {
  const f = await fixture();
  f.options.requestExclusiveLock = async (_name, _options, operation) => {
    f.table('sync_connection').set('connection', {
      version: 1,
      kind: 'sync-connection',
      key: 'connection',
      binding: f.input.draft.remote.binding,
      identity: { ...f.input.authorization, revision: 2 },
      phase: 'paused',
      updateNonce: null,
      credentialId: '33333333-3333-4333-8333-333333333333',
    });
    await operation(true);
  };
  await expect(f.unload()).rejects.toThrow('admission refused');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
});

it('returns busy for an active object writer without creating an intent', async () => {
  const f = await fixture();
  f.options.requestExclusiveLock = async (_name, _options, operation) => operation(false);
  expect(await f.unload()).toBe('busy');
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').size).toBe(0);
});

async function unloaded(f: Awaited<ReturnType<typeof fixture>>) {
  const copy = await f.unload();
  if (copy === 'busy') throw new Error('The test requires an unloaded source');
  return copy;
}

it('restores the same native original and replays lost completion without duplicating identity', async () => {
  const f = await fixture();
  const native = structuredClone([
    f.table('asset_refs'),
    f.table('asset_owners'),
    f.table('media_library'),
  ]);
  const copy = await unloaded(f);
  const input = { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization };
  expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({
    phase: 'resident',
    revision: 3,
  });
  expect(await f.bytes()).toBe('abc');
  expect([f.table('asset_refs'), f.table('asset_owners'), f.table('media_library')]).toEqual(
    native
  );
  expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({
    phase: 'resident',
    revision: 3,
  });
  expect(f.table('asset_residency').size).toBe(1);
});

it('refuses wrong staged bytes without changing native metadata or declaring them resident', async () => {
  const f = await fixture();
  const copy = await unloaded(f);
  await expect(
    restoreVerifiedAssetObject(
      { copy, sourceBlob: new Blob(['def']), authorization: f.input.authorization },
      f.options
    )
  ).rejects.toThrow();
  expect(f.table('asset_residency').get(copy.id)).toEqual(copy);
  expect((await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).size).toBe(0);
  expect(f.table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
  expect(
    await restoreVerifiedAssetObject(
      { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization },
      f.options
    )
  ).toMatchObject({ phase: 'resident' });
  expect(await f.bytes()).toBe('abc');
});

it.each(['deleted', 'recreated', 'unowned', 'intent', 'authorization'] as const)(
  'refuses restore after %s source authority changed',
  async (change) => {
    const f = await fixture();
    const copy = await unloaded(f);
    if (change === 'deleted') f.table('asset_refs').delete(f.ref.assetId);
    if (change === 'recreated')
      f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    if (change === 'unowned') f.table('asset_owners').clear();
    if (change === 'intent')
      f.table('asset_residency').set(copy.id, { ...copy, operationId: 'new-operation' });
    const authorization =
      change === 'authorization'
        ? { ...f.input.authorization, revision: 2 }
        : f.input.authorization;
    await expect(
      restoreVerifiedAssetObject({ copy, sourceBlob: new Blob(['abc']), authorization }, f.options)
    ).rejects.toThrow();
    expect(f.objects.entriesByName.has(f.ref.assetId)).toBe(false);
    expect(f.table('asset_residency').get(copy.id)).toMatchObject({ phase: 'unloaded' });
  }
);

it('retries failed restore settlement against the valid installed file without truncation', async () => {
  const f = await fixture();
  const copy = await unloaded(f);
  const input = { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization };
  f.objects.initializeCreatedFile = (file) => {
    file.afterCommitCloseEffect = async () => {
      f.failWrites();
    };
  };
  await expect(restoreVerifiedAssetObject(input, f.options)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(await f.bytes()).toBe('abc');
  expect(f.table('asset_residency').get(copy.id)).toEqual(copy);
  f.allowWrites();
  const handle = await f.objects.getFileHandle(f.ref.assetId);
  const truncate = vi.spyOn(handle, 'createWritable');
  expect(await restoreVerifiedAssetObject(input, f.options)).toMatchObject({ phase: 'resident' });
  expect(truncate).not.toHaveBeenCalled();
  expect(await f.bytes()).toBe('abc');
});

it('rechecks restore source after a controlled wait and refuses same-ID replacement', async () => {
  const f = await fixture();
  const copy = await unloaded(f);
  f.options.requestExclusiveLock = async (_name, _options, operation) => {
    f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    await operation(true);
  };
  await expect(
    restoreVerifiedAssetObject(
      { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization },
      f.options
    )
  ).rejects.toThrow('source changed');
  expect(f.objects.entriesByName.has(f.ref.assetId)).toBe(false);
  expect(f.table('asset_residency').get(copy.id)).toEqual(copy);
});

it('reuses the staged workflow transition instead of requesting another shared gate', async () => {
  const f = await fixture();
  const copy = await unloaded(f);
  let transitionRequests = 0;
  installPersistenceLockManagerForTests({
    async request(name, options, operation) {
      if (name.endsWith(':transition') && options.mode === 'shared' && ++transitionRequests > 1)
        throw new Error('Nested transition would wait behind erasure');
      return operation();
    },
  });
  try {
    await runWithPersistenceMutationTransition(async (permit) => {
      expect(
        await restoreVerifiedAssetObject(
          { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization },
          { ...f.options, persistenceTransitionPermit: permit }
        )
      ).toMatchObject({ phase: 'resident' });
    });
    expect(transitionRequests).toBe(1);
  } finally {
    installPersistenceLockManagerForTests(null);
  }
});

it.each(['present', 'removed'] as const)(
  'recovers interrupted unload with %s bytes into resident without restarting old deletion',
  async (state) => {
    const f = await fixture();
    f.objects.removeEffect =
      state === 'present'
        ? async () => {
            throw new Error('Deletion refused');
          }
        : async () => {
            f.failWrites();
          };
    await expect(f.unload()).rejects.toThrow();
    f.allowWrites();
    f.objects.removeEffect = async () => undefined;
    const parsed = f.table('asset_residency').get(assetResidencyCopyId(f.input.draft.target));
    const copy = parseAssetResidencyRecord(parsed);
    if (!copy || copy.kind !== 'copy') throw new Error('Expected interrupted intent');
    expect(copy.phase).toBe('unloading');
    expect(
      await restoreVerifiedAssetObject(
        { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization },
        f.options
      )
    ).toMatchObject({ phase: 'resident', revision: 2 });
    expect(await f.bytes()).toBe('abc');
    await expect(f.unload()).rejects.toThrow('cannot restart');
  }
);

it('refuses expired outer transition reuse before restoring any native bytes', async () => {
  const f = await fixture();
  const copy = await unloaded(f);
  let retained: PersistenceMutationTransitionPermit | undefined;
  await runWithPersistenceMutationTransition(async (permit) => {
    retained = permit;
  });
  if (!retained) throw new Error('Expected expired permit');
  await expect(
    restoreVerifiedAssetObject(
      { copy, sourceBlob: new Blob(['abc']), authorization: f.input.authorization },
      { ...f.options, persistenceTransitionPermit: retained }
    )
  ).rejects.toThrow('transition permit is not active');
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_residency').get(copy.id)).toEqual(copy);
});

it('ignores pin intents whose native root was permanently deleted while preserving unrelated pin intent', async () => {
  const f = await fixture();
  for (const rootKind of ['media', 'video-project', 'video-review', 'scenario-project']) {
    const rootId = `deleted-${rootKind}`;
    const id = JSON.stringify(['root', rootKind, rootId]);
    f.table('asset_residency').set(id, {
      version: 1,
      kind: 'root',
      id,
      revision: 1,
      rootKind,
      rootId,
      pinned: true,
      lastUsedAt: 1,
    });
  }
  await expect(f.unload()).resolves.toMatchObject({ phase: 'unloaded' });
  expect(f.table('asset_residency').size).toBe(5);
});

it('still refuses a malformed live pinned root instead of treating it as deleted', async () => {
  const f = await fixture();
  const rootId = 'malformed-live-project';
  const id = JSON.stringify(['root', 'video-project', rootId]);
  f.table('asset_residency').set(id, {
    version: 1,
    kind: 'root',
    id,
    revision: 1,
    rootKind: 'video-project',
    rootId,
    pinned: true,
    lastUsedAt: 1,
  });
  f.table('video_projects').set(rootId, { id: rootId, damaged: true });
  await expect(f.unload()).rejects.toThrow('Native editing resources are unavailable');
  expect(await f.bytes()).toBe('abc');
});
