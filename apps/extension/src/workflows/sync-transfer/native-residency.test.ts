import { receiveSelectedCatalogRoot } from './incoming-selected';
import { indexCatalogCopies } from './residency-copy';
import { projectSyncCatalog, type CatalogAttempt } from './catalog-graph';
import { attempt, mediaEnvelope, projectEnvelope, object } from './incoming.test-support';
import { hashSyncText } from './wire-record';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { encodePortableScenarioProjectEntry } from '../media-hub-backup/v6/root-codecs/projects';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { parseScenarioAssetEntry } from '../../composition/persistence/scenario/read-guards';
import { parseAssetRef } from '../../composition/persistence/assets/guards';
import {
  writeReadyJournal,
  deleteReadyJournal,
  releaseAssetReadyProtection,
} from '../../composition/persistence/assets';
import { readNativeCacheStatus, trimNativeCache } from './native-cache-policy';
import {
  releaseNativeEditingRoot,
  readNativeCacheSettings,
  readNativeCacheRootStatus,
  setNativeCacheBudget,
  setNativeCacheRootPinned,
  touchNativeCacheRoot,
} from './native-cache';
import { stageRootObjects } from '../media-hub-backup/v6/staging';
import { readAssetFile, discardPreparedAsset } from '../../composition/persistence/assets';
import { runWithPersistenceMutationTransition } from '../../composition/persistence/infrastructure/mutation-barrier';
// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../../composition/persistence/review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.storage.test-support';
import {
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import { VideoProjectAssetType } from '../../features/video/project/types';
import { EXPECTED_STORES } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import {
  createHarness,
  MemoryDirectoryHandle,
} from '../../composition/persistence/assets/opfs-store.test-support';
import { ASSET_ROOT_DIRECTORY_NAME } from '../../composition/persistence/assets/opfs-store';
import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
} from '../../composition/persistence/assets/residency-records';
import type { AssetRef } from '../../composition/persistence/assets/contracts';
import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import {
  freezeImageInTransaction,
  digestCapturedImageRows,
} from '../../composition/persistence/sync-capture/image-snapshot';
import {
  hasUnloadedNativeEditingRoot,
  needsNativeEditingPreparation,
  restoreStagedNativeOriginal,
  isNativeEditingRootReady,
  prepareNativeEditingRoot,
} from './native-residency';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';

const io = vi.hoisted(() => ({
  db: vi.fn(),
  preparePublication: vi.fn(),
  preparedRoot: null as { rootKind: string; rootId: string } | null,
}));
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({
    prepareNativeBackup: async (root: { rootKind: string; rootId: string }) => {
      await io.preparePublication(root);
      io.preparedRoot = root;
      return { kind: 'accepted', requestId: 'publication-prepare' };
    },
    waitForOperation: async () => ({
      job: { state: 'ready' },
      completion: { kind: 'native', root: io.preparedRoot },
    }),
  }),
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.db,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture(inline = false) {
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
  let quotaFailure = false;
  const data = createReviewWorkspaceStoreFixture(
    (name) => quotaFailure && name === 'asset_residency'
  );
  data.rows.clear();
  for (const name of EXPECTED_STORES) data.rows.set(name, new Map());
  const table = (name: string) => data.rows.get(name)!;
  io.db.mockResolvedValue({
    ...data.database,
    async get(store: string, key: IDBValidKey) {
      const tx = data.database.transaction([store], 'readonly');
      const value = await tx.objectStore(store).get(key);
      await tx.done;
      return value;
    },
    async put(store: string, value: unknown) {
      const tx = data.database.transaction([store], 'readwrite');
      await tx.objectStore(store).put(value);
      await tx.done;
    },
    async delete(store: string, key: IDBValidKey) {
      const tx = data.database.transaction([store], 'readwrite');
      await tx.objectStore(store).delete(key);
      await tx.done;
    },
    async getAllKeys(store: string) {
      const tx = data.database.transaction([store], 'readonly');
      const keys = await tx.objectStore(store).getAllKeys();
      await tx.done;
      return keys;
    },
    async getAll(store: string) {
      const tx = data.database.transaction([store], 'readonly');
      const values = await tx.objectStore(store).getAll();
      await tx.done;
      return values;
    },
  });
  const ref: AssetRef = {
    assetId: 'original',
    createdAt: 1,
    mimeType: 'image/png',
    size: 3,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/original' },
  };
  const media = createMediaLibraryEntry({
    id: 'image',
    kind: inline ? 'screenshot' : 'image',
    size: 3,
    workspaceRevision: 0,
    source: inline ? { kind: 'screenshot' } : { kind: 'stored-asset', assetId: ref.assetId },
  });
  table('media_library').set(media.id, media);
  if (!inline) {
    table('asset_refs').set(ref.assetId, ref);
    table('asset_owners').set(JSON.stringify(['media-library', media.id, 'source']), {
      assetId: ref.assetId,
      ownerKind: 'media-library',
      ownerId: media.id,
      role: 'source',
    });
  }
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
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
    createdAt: 1,
  });
  table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity: authorization,
    phase: 'active',
    credentialId: '33333333-3333-4333-8333-333333333333',
    updateNonce: null,
  });
  const rootKey = captureRootKey('space', 'media', media.id);
  let digest = 'b'.repeat(64);
  if (inline) {
    table('media_library').set(media.id, { ...media, blob: new Blob(['abc']) });
    const tx = data.database.transaction([...EXPECTED_STORES], 'readonly');
    // Browser boundary fixture implements the transaction methods used by the native projection.
    const native = tx as unknown as Parameters<typeof freezeImageInTransaction>[0];
    digest = digestCapturedImageRows(await freezeImageInTransaction(native, media.id));
    await tx.done;
    table('media_library').set(media.id, media);
  }
  table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: media.id,
    rootKey,
    generation: 1,
    basis: ['applied'],
    nativeRevision: 0,
    nativeDigest: digest,
  });
  const target = inline
    ? {
        kind: 'inline-image' as const,
        mediaId: media.id,
        createdAt: media.createdAt,
        workspaceRevision: 0,
        rootGeneration: 1,
        nativeDigest: digest,
        size: 3,
        mimeType: media.mimeType,
        blobType: '',
      }
    : { kind: 'opfs' as const, ref };
  const copy: AssetResidencyCopy = {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId(target),
    revision: 2,
    operationId: 'unload',
    phase: 'unloaded',
    target,
    lastUsedAt: 1,
    remote: {
      binding,
      key: 'Originals/attempt/Снимок 100%.png',
      sha256: createHash('sha256').update('abc').digest('hex'),
    },
  };
  table('asset_residency').set(copy.id, copy);
  const harness = createHarness();
  const assets = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assets);
  assets.entriesByName.set('objects', objects);
  // Native boundary fake: these tests exercise real staging/installers, without scheduling lock contention.
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: harness.options.getOriginRoot,
      estimate: async () => ({ quota: 2 ** 30, usage: 0 }),
    },
    locks: {
      request: async (_name: string, _options: unknown, operation: (lock: object) => unknown) =>
        operation({}),
    },
  });
  const remote = {
    list: vi.fn<SyncRemoteStore['list']>(),
    stat: vi.fn<SyncRemoteStore['stat']>(),
    write: vi.fn<SyncRemoteStore['write']>(),
    read: vi.fn<SyncRemoteStore['read']>().mockImplementation(
      async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('abc'));
            controller.close();
          },
        })
    ),
  };
  const args = {
    root: { rootKind: 'media' as const, rootId: media.id },
    binding,
    authorization,
    remote,
    signal: new AbortController().signal,
  };
  return {
    ...data,
    ...harness,
    table,
    ref,
    media,
    copy,
    objects,
    remote,
    args,
    fail: () => {
      quotaFailure = true;
    },
    allow: () => {
      quotaFailure = false;
    },
  };
}

it('downloads missing OPFS bytes through real checked staging and restores the original native identity', async () => {
  const f = await fixture();
  const native = structuredClone([
    f.table('asset_refs'),
    f.table('asset_owners'),
    f.table('media_library'),
  ]);
  expect(await hasUnloadedNativeEditingRoot(f.args.root)).toBe(true);
  expect(await isNativeEditingRootReady(f.args.root)).toBe(false);
  expect(await prepareNativeEditingRoot(f.args)).toEqual({ downloaded: 1 });
  expect([...f.objects.entriesByName.keys()]).toEqual([f.ref.assetId]);
  expect(await (await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).text()).toBe('abc');
  expect([f.table('asset_refs'), f.table('asset_owners'), f.table('media_library')]).toEqual(
    native
  );
  expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({
    phase: 'resident',
    revision: 3,
  });
  expect(f.remote.read).toHaveBeenCalledExactlyOnceWith(f.copy.remote.key, f.args.signal);
  expect(f.remote.list).not.toHaveBeenCalled();
  expect(f.remote.stat).not.toHaveBeenCalled();
  expect(f.remote.write).not.toHaveBeenCalled();
  expect(await hasUnloadedNativeEditingRoot(f.args.root)).toBe(false);
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
  expect(await prepareNativeEditingRoot(f.args)).toEqual({ downloaded: 0 });
  expect(f.remote.read).toHaveBeenCalledTimes(1);
});

it('restores an inline original without retaining its temporary transfer file', async () => {
  const f = await fixture(true);
  expect(await prepareNativeEditingRoot(f.args)).toEqual({ downloaded: 1 });
  expect(f.table('media_library').get(f.media.id)).toMatchObject({ blob: expect.any(Blob) });
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_refs').size).toBe(0);
  expect(f.table('asset_owners').size).toBe(0);
  expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'resident' });
});

it('preserves completed bytes after native settlement refusal and retries without another download', async () => {
  const f = await fixture();
  f.fail();
  await expect(prepareNativeEditingRoot(f.args)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect([...f.objects.entriesByName.keys()]).toEqual([f.ref.assetId]);
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
  f.allow();
  expect(await prepareNativeEditingRoot(f.args)).toEqual({ downloaded: 0 });
  expect(f.remote.read).toHaveBeenCalledTimes(1);
  expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'resident' });
});

it.each(['missing-copy', 'namespace'] as const)(
  'refuses %s recovery evidence before remote access',
  async (change) => {
    const f = await fixture();
    if (change === 'missing-copy') f.table('asset_residency').clear();
    else
      f.table('asset_residency').set(f.copy.id, {
        ...f.copy,
        remote: {
          ...f.copy.remote,
          binding: { ...f.copy.remote.binding, rootUrl: 'https://foreign.example.test/root/' },
        },
      });
    await expect(prepareNativeEditingRoot(f.args)).rejects.toThrow('binding is unavailable');
    expect(f.remote.read).not.toHaveBeenCalled();
    expect(f.objects.entriesByName.size).toBe(0);
  }
);

it('propagates temporary remote refusal without internal retries and completes a later retry', async () => {
  const f = await fixture();
  f.remote.read.mockRejectedValueOnce(new SyncRemoteError('temporary', 423));
  await expect(prepareNativeEditingRoot(f.args)).rejects.toMatchObject({
    code: 'temporary',
    status: 423,
  });
  expect(f.remote.read).toHaveBeenCalledTimes(1);
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
  expect(await prepareNativeEditingRoot(f.args)).toEqual({ downloaded: 1 });
});

it('refuses corrupt downloaded bytes and removes the partial staging object', async () => {
  const f = await fixture();
  f.remote.read.mockResolvedValueOnce(new Blob(['bad']).stream());
  await expect(prepareNativeEditingRoot(f.args)).rejects.toThrow('checksum');
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
});

it('cancels staging without changing native availability or retaining partial bytes', async () => {
  const f = await fixture();
  const controller = new AbortController();
  await expect(
    prepareNativeEditingRoot({
      ...f.args,
      signal: controller.signal,
      onBytesRead: () => controller.abort(),
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
});

it('refuses a changed native source after download and discards only staging', async () => {
  const f = await fixture();
  f.remote.read.mockImplementationOnce(async () => {
    f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    return new Blob(['abc']).stream();
  });
  await expect(prepareNativeEditingRoot(f.args)).rejects.toThrow('source changed');
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.table('asset_refs').get(f.ref.assetId)).toMatchObject({ createdAt: 2 });
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
});

it('local readiness reads actual bytes without repairing lagging availability or contacting the provider', async () => {
  const f = await fixture();
  const file = await f.objects.getFileHandle(f.ref.assetId, { create: true });
  const writable = await file.createWritable();
  await writable.write('abc');
  await writable.close();
  const before = structuredClone(f.rows);
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
  expect(f.rows).toEqual(before);
  expect(f.remote.read).not.toHaveBeenCalled();
  expect(f.remote.list).not.toHaveBeenCalled();
});

it('prepares every selected Montage dependency under its existing identity without rewriting the project', async () => {
  const f = await fixture();
  const secondRef: AssetRef = {
    ...f.ref,
    assetId: 'second-original',
    location: { kind: 'opfs', objectKey: 'objects/second-original' },
  };
  const second = {
    ...f.media,
    id: 'second-image',
    source: { kind: 'stored-asset' as const, assetId: secondRef.assetId },
  };
  f.table('asset_refs').set(secondRef.assetId, secondRef);
  f.table('media_library').set(second.id, second);
  f.table('asset_owners').set(JSON.stringify(['media-library', second.id, 'source']), {
    assetId: secondRef.assetId,
    ownerKind: 'media-library',
    ownerId: second.id,
    role: 'source',
  });
  const copy: AssetResidencyCopy = {
    ...f.copy,
    id: assetResidencyCopyId({ kind: 'opfs', ref: secondRef }),
    target: { kind: 'opfs', ref: secondRef },
    remote: {
      ...f.copy.remote,
      key: 'Originals/attempt/second.png',
      sha256: createHash('sha256').update('xyz').digest('hex'),
    },
  };
  f.table('asset_residency').set(copy.id, copy);
  const montage = createVideoProjectEntryWithMediaClip({ id: 'montage' });
  const first = montage.project.assets[0]!;
  first.type = VideoProjectAssetType.IMAGE;
  first.source = { kind: 'library-asset', mediaId: f.media.id };
  first.metadata = {
    ...first.metadata,
    size: f.media.size,
    mimeType: f.media.mimeType,
    width: 10,
    height: 10,
    duration: null,
    hasAudio: false,
  };
  montage.project.assets.push({
    ...structuredClone(first),
    id: first.id + '-second',
    source: { kind: 'library-asset', mediaId: second.id },
  });
  f.table('video_projects').set(montage.id, montage);
  const before = structuredClone(montage);
  f.remote.read.mockImplementation(async (key) =>
    new Blob([key === copy.remote.key ? 'xyz' : 'abc']).stream()
  );
  expect(
    await prepareNativeEditingRoot({
      ...f.args,
      root: { rootKind: 'video-project', rootId: montage.id },
    })
  ).toEqual({ downloaded: 2 });
  expect([...f.objects.entriesByName.keys()].sort()).toEqual(
    [f.ref.assetId, secondRef.assetId].sort()
  );
  expect(await (await (await f.objects.getFileHandle(secondRef.assetId)).getFile()).text()).toBe(
    'xyz'
  );
  expect(f.table('video_projects').get(montage.id)).toEqual(before);
  expect(f.remote.read).toHaveBeenCalledTimes(2);
});

it.each(['media', 'video-project', 'video-review', 'scenario-project'] as const)(
  'keeps absent %s roots with their existing creation or missing-document flow',
  async (rootKind) => {
    const f = await fixture();
    await expect(needsNativeEditingPreparation({ rootKind, rootId: 'not-created' })).resolves.toBe(
      false
    );
    expect(f.remote.read).not.toHaveBeenCalled();
  }
);
it('requires preparation for actual unloaded originals, then allows a fully local opening', async () => {
  const f = await fixture();
  await expect(needsNativeEditingPreparation(f.args.root)).resolves.toBe(true);
  await prepareNativeEditingRoot(f.args);
  await expect(needsNativeEditingPreparation(f.args.root)).resolves.toBe(false);
});

it.each(['same-body', 'changed-body'] as const)(
  'uses checked incoming staging to restore the old native ref only for %s',
  async (kind) => {
    const f = await fixture();
    const staged = await stageRootObjects({
      objects: [
        {
          objectId: 'incoming',
          path: 'original',
          filename: 'original.png',
          mimeType: f.ref.mimeType,
          size: f.ref.size,
        },
      ],
      expectedSha256: new Map([['incoming', f.copy.remote.sha256]]),
      signal: f.args.signal,
      async readObject() {
        const stream = await f.remote.read('incoming-original', f.args.signal);
        return { pipeTo: (sink, signal) => stream.pipeTo(sink, signal ? { signal } : {}) };
      },
    });
    const source = staged[0];
    if (!source) throw new Error('Expected staging');
    try {
      const recovered = await runWithPersistenceMutationTransition((transitionPermit) =>
        restoreStagedNativeOriginal({
          ref: f.ref,
          sourceRef: source.ref,
          sha256: kind === 'same-body' ? f.copy.remote.sha256 : '0'.repeat(64),
          scope: f.args.binding,
          transitionPermit,
          signal: f.args.signal,
        })
      );
      expect(recovered).toBe(kind === 'same-body');
      expect(f.remote.read).toHaveBeenCalledTimes(1);
      expect(f.table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
      if (recovered) {
        expect(await (await readAssetFile(f.ref, 'original.png')).text()).toBe('abc');
        expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'resident' });
      } else expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'unloaded' });
      expect(await (await readAssetFile(source.ref, 'staged.png')).text()).toBe('abc');
    } finally {
      await discardPreparedAsset(source.ref.assetId);
    }
  }
);

it('refuses changed connection scope without consuming staging or changing unloaded bytes', async () => {
  const f = await fixture();
  const staged = await stageRootObjects({
    objects: [
      {
        objectId: 'incoming',
        path: 'original',
        filename: 'original.png',
        mimeType: f.ref.mimeType,
        size: f.ref.size,
      },
    ],
    expectedSha256: new Map([['incoming', f.copy.remote.sha256]]),
    signal: f.args.signal,
    async readObject() {
      const stream = await f.remote.read('incoming-original', f.args.signal);
      return { pipeTo: (sink, signal) => stream.pipeTo(sink, signal ? { signal } : {}) };
    },
  });
  const source = staged[0];
  if (!source) throw new Error('Expected staging');
  try {
    await expect(
      runWithPersistenceMutationTransition((transitionPermit) =>
        restoreStagedNativeOriginal({
          ref: f.ref,
          sourceRef: source.ref,
          sha256: f.copy.remote.sha256,
          scope: { ...f.args.binding, connectionGeneration: 99 },
          transitionPermit,
          signal: f.args.signal,
        })
      )
    ).rejects.toThrow('authorization changed');
    expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'unloaded' });
    expect(await (await readAssetFile(source.ref, 'staged.png')).text()).toBe('abc');
    expect(f.remote.read).toHaveBeenCalledTimes(1);
  } finally {
    await discardPreparedAsset(source.ref.assetId);
  }
});

function cacheIndex(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    spaceId: 'space',
    operations: new Map<string, { rootKind: string; rootId: string }>([
      ['applied', { ...f.args.root }],
    ]),
    copies: new Map([
      [
        `${f.copy.remote.sha256}:3`,
        [
          {
            spaceId: 'space',
            operationId: 'applied',
            objectId: 'original',
            attemptId: '00000000-0000-4000-8000-000000000001',
            recordKey: 'records/original',
            remoteKey: f.copy.remote.key,
            sha256: f.copy.remote.sha256,
            size: 3,
          },
        ],
      ],
    ]),
  };
}

it.each([false, true])(
  'verifies a remote copy before manual release, then restores the same native original, inline: %s',
  async (inline) => {
    const f = await fixture(inline);
    await prepareNativeEditingRoot(f.args);
    const before = structuredClone([
      f.table('asset_refs'),
      f.table('asset_owners'),
      f.table('sync_capture'),
    ]);
    f.remote.read.mockClear();
    await expect(releaseNativeEditingRoot({ ...f.args, index: cacheIndex(f) })).resolves.toEqual({
      released: 1,
      releasedBytes: 3,
      absent: 0,
      unavailable: 0,
      protected: 0,
      busy: 0,
    });
    expect(f.remote.read).toHaveBeenCalledExactlyOnceWith(f.copy.remote.key, f.args.signal);
    expect(await isNativeEditingRootReady(f.args.root)).toBe(false);
    expect([f.table('asset_refs'), f.table('asset_owners'), f.table('sync_capture')]).toEqual(
      before
    );
    expect(f.table('asset_residency').get(f.copy.id)).toMatchObject({ phase: 'unloaded' });
    await prepareNativeEditingRoot(f.args);
    expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
  }
);

it.each(['missing', 'corrupt', 'temporary'] as const)(
  'keeps local originals after %s remote verification',
  async (kind) => {
    const f = await fixture();
    await prepareNativeEditingRoot(f.args);
    const before = structuredClone(f.table('asset_residency'));
    if (kind === 'corrupt') f.remote.read.mockResolvedValue(new Blob(['bad']).stream());
    else f.remote.read.mockRejectedValue(new SyncRemoteError(kind));
    const result = releaseNativeEditingRoot({ ...f.args, index: cacheIndex(f) });
    if (kind === 'temporary') await expect(result).rejects.toBeInstanceOf(SyncRemoteError);
    else await expect(result).resolves.toMatchObject({ released: 0, unavailable: 1 });
    expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
    expect(f.table('asset_residency')).toEqual(before);
  }
);

it('keeps offline pin intent through late usage updates and refuses to release pinned dependencies', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  await touchNativeCacheRoot(f.args.root, 20);
  const pin = await setNativeCacheRootPinned(f.args.root, true, 10);
  await touchNativeCacheRoot(f.args.root, 15);
  expect(f.table('asset_residency').get(pin.id)).toMatchObject({ pinned: true, lastUsedAt: 20 });
  await expect(
    releaseNativeEditingRoot({ ...f.args, index: cacheIndex(f) })
  ).resolves.toMatchObject({ protected: 1, released: 0 });
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
});

it('defers manual release while another reader owns the source', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  vi.stubGlobal('navigator', {
    ...navigator,
    storage: navigator.storage,
    locks: {
      request: async (
        name: string,
        options: LockOptions,
        operation: (lock: object | null) => unknown
      ) =>
        operation(
          name === 'sniptale:assets:resource-readers' && options.mode === 'exclusive' ? null : {}
        ),
    },
  });
  await expect(
    releaseNativeEditingRoot({ ...f.args, index: cacheIndex(f) })
  ).resolves.toMatchObject({ busy: 1, released: 0 });
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
});

it('uses one soft budget with CAS and preserves current Settings after stale commands', async () => {
  await fixture();
  const initial = await readNativeCacheSettings();
  expect(initial).toMatchObject({ revision: 0, budgetBytes: 1024 * 1024 * 1024 });
  expect(await setNativeCacheBudget(0, 0)).toMatchObject({ revision: 1, budgetBytes: 0 });
  await expect(setNativeCacheBudget(4096, 0)).rejects.toThrow('stale');
  expect(await readNativeCacheSettings()).toMatchObject({ revision: 1, budgetBytes: 0 });
});

it('does not release an original when the retained operation belongs to another logical root', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  f.remote.read.mockClear();
  const index = cacheIndex(f);
  index.operations.set('applied', { rootKind: 'media', rootId: 'other-root' });
  await expect(releaseNativeEditingRoot({ ...f.args, index })).rejects.toThrow(
    'no checked remote publication'
  );
  expect(f.remote.read).not.toHaveBeenCalled();
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
});

function seedCacheMedia(
  f: Awaited<ReturnType<typeof fixture>>,
  ref: AssetRef,
  id: string,
  operationId: string,
  index: ReturnType<typeof cacheIndex>
) {
  f.table('asset_refs').set(ref.assetId, ref);
  f.table('asset_owners').set(JSON.stringify(['media-library', id, 'source']), {
    ownerKind: 'media-library',
    ownerId: id,
    role: 'source',
    assetId: ref.assetId,
  });
  f.table('media_library').set(
    id,
    createMediaLibraryEntry({
      ...f.media,
      id,
      source: { kind: 'stored-asset', assetId: ref.assetId },
      size: ref.size,
      mimeType: ref.mimeType,
    })
  );
  const rootKey = captureRootKey('space', 'media', id);
  f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: id,
    rootKey,
    generation: 1,
    basis: [operationId],
    nativeRevision: 0,
    nativeDigest: 'b'.repeat(64),
  });
  index.operations.set(operationId, { rootKind: 'media', rootId: id });
  return { rootKind: 'media' as const, rootId: id };
}
async function additionalCacheFile(f: Awaited<ReturnType<typeof fixture>>) {
  const staged = await stageRootObjects({
    objects: [
      { objectId: 'extra', path: 'extra', filename: 'extra.png', mimeType: 'image/png', size: 3 },
    ],
    expectedSha256: new Map([['extra', f.copy.remote.sha256]]),
    signal: f.args.signal,
    async readObject() {
      const stream = await f.remote.read('extra', f.args.signal);
      return { pipeTo: (sink, signal) => stream.pipeTo(sink, signal ? { signal } : {}) };
    },
  });
  const source = staged[0];
  if (!source) throw new Error('Expected staging');
  return source.ref;
}

it('reports actual local original bytes separately from missing bytes and the soft budget', async () => {
  const f = await fixture();
  await expect(readNativeCacheStatus()).resolves.toMatchObject({
    residentBytes: 0,
    missingBytes: 3,
    pinnedBytes: 0,
    overBudgetBytes: 0,
  });
  await prepareNativeEditingRoot(f.args);
  await setNativeCacheBudget(0, 0);
  await expect(readNativeCacheStatus()).resolves.toMatchObject({
    residentBytes: 3,
    missingBytes: 0,
    overBudgetBytes: 3,
  });
});

it('evicts by last use while keeping a shared original that another root used more recently', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  const index = cacheIndex(f);
  const shared = seedCacheMedia(f, f.ref, 'recent-shared-root', 'shared-op', index);
  const extra = await additionalCacheFile(f);
  const old = seedCacheMedia(f, extra, 'older-private-root', 'old-op', index);
  // The fixture adopts a completed native publication; a raw staged writer must remain protected.
  await writeReadyJournal({
    assetRefs: [extra],
    createdAt: 1,
    domain: 'image-workspace',
    journalId: 'cache-fixture-completed',
    payload: { aggregateId: old.rootId },
  });
  await deleteReadyJournal('cache-fixture-completed');
  await releaseAssetReadyProtection([extra.assetId]);
  const now = Date.now() + 1000;
  await touchNativeCacheRoot(f.args.root, now + 10);
  await touchNativeCacheRoot(old, now + 20);
  await touchNativeCacheRoot(shared, now + 30);
  await setNativeCacheBudget(3, 0);
  expect(await readNativeCacheStatus()).toMatchObject({ residentBytes: 6 });
  const result = await trimNativeCache({ ...f.args, index });
  expect(result).toMatchObject({
    released: 1,
    releasedBytes: 3,
    status: { residentBytes: 3, overBudgetBytes: 0 },
  });
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
  expect(await isNativeEditingRootReady(shared)).toBe(true);
  expect(await isNativeEditingRootReady(old)).toBe(false);
  await setNativeCacheRootPinned(shared, true, now + 40);
  await setNativeCacheBudget(0, 1);
  f.remote.read.mockClear();
  await expect(trimNativeCache({ ...f.args, index })).resolves.toMatchObject({
    released: 0,
    protected: 1,
    status: { residentBytes: 3, pinnedBytes: 3, pinnedRoots: 1, overBudgetBytes: 3 },
  });
  expect(f.remote.read).not.toHaveBeenCalled();
});

it('retains local-only originals even when the same body is present remotely and budget is zero', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  const rootKey = captureRootKey('space', 'media', f.media.id);
  const key = JSON.stringify(['root-state', rootKey]);
  const state = f.table('sync_capture').get(key);
  if (!state || typeof state !== 'object') throw new Error('Expected state');
  f.table('sync_capture').set(key, { ...state, basis: [] });
  await setNativeCacheBudget(0, 0);
  f.remote.read.mockClear();
  await expect(trimNativeCache({ ...f.args, index: cacheIndex(f) })).resolves.toMatchObject({
    released: 0,
    protected: 1,
    status: { residentBytes: 3, overBudgetBytes: 3 },
  });
  expect(f.remote.read).not.toHaveBeenCalled();
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
});

it('keeps pin intent separate from offline readiness and does not download while recording that intent', async () => {
  const f = await fixture();
  await expect(setNativeCacheRootPinned(f.args.root, true, 10)).resolves.toMatchObject({
    pinned: true,
  });
  expect(await isNativeEditingRootReady(f.args.root)).toBe(false);
  expect(f.remote.read).not.toHaveBeenCalled();
  await prepareNativeEditingRoot(f.args);
  expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
});

it('does not create cache usage rows for a disabled synchronization profile', async () => {
  const f = await fixture();
  const profile = f.table('sync_capture').get('profile');
  if (!profile || typeof profile !== 'object') throw new Error('Expected profile');
  f.table('sync_capture').set('profile', { ...profile, enabled: false });
  const before = structuredClone(f.table('asset_residency'));
  await touchNativeCacheRoot(f.args.root, 10);
  expect(f.table('asset_residency')).toEqual(before);
});

it('projects availability from native bytes and publication without authorizing release', async () => {
  const f = await fixture();
  const root = f.args.root;
  await expect(readNativeCacheRootStatus(root)).resolves.toMatchObject({
    root,
    configured: true,
    ready: false,
    pinned: false,
    releaseAllowed: true,
  });
  await setNativeCacheRootPinned(root, true);
  await expect(readNativeCacheRootStatus(root)).resolves.toMatchObject({
    pinned: true,
    ready: false,
  });
  await prepareNativeEditingRoot(f.args);
  await expect(readNativeCacheRootStatus(root)).resolves.toMatchObject({
    pinned: true,
    ready: true,
  });
  f.table('sync_connection').delete('connection');
  await expect(readNativeCacheRootStatus(root)).resolves.toMatchObject({
    ready: true,
    releaseAllowed: false,
  });
});

it.each([true, false])(
  'publishes actual metadata capture after restoring unloaded inline=%s originals and prepares its outgoing bytes',
  async (inline) => {
    const f = await fixture(inline);
    vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
    io.preparePublication.mockImplementation(async () =>
      prepareNativeEditingRoot({ ...f.args, purpose: 'backup' })
    );
    const { updateMediaLibraryEntrySafely } = await import('../media-hub/store');
    await updateMediaLibraryEntrySafely(f.media.id, {
      filename: 'renamed.png',
      tags: ['retained'],
    });
    expect(f.table('media_library').get(f.media.id)).toMatchObject({
      filename: 'renamed.png',
      tags: ['retained'],
    });
    const { parseSyncCaptureRecord } =
      await import('../../composition/persistence/sync-capture/guards');
    const captures = [...f.table('sync_capture').values()].flatMap((value) => {
      const record = parseSyncCaptureRecord(value);
      return record?.kind === 'sync-operation' && record.phase === 'native' ? [record] : [];
    });
    expect(captures).toHaveLength(1);
    const { prepareCapturedOutgoing } = await import('./outgoing');
    const prepared = await prepareCapturedOutgoing(captures[0]!);
    expect(prepared.objects.some((object) => object.sha256 === f.copy.remote.sha256)).toBe(true);
    expect(f.remote.read).toHaveBeenCalledOnce();
  }
);
it('keeps unloaded metadata unchanged on temporary preparation refusal and completes a retry', async () => {
  const f = await fixture(true);
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  f.remote.read.mockRejectedValueOnce(new SyncRemoteError('temporary', 423));
  io.preparePublication.mockImplementation(async () =>
    prepareNativeEditingRoot({ ...f.args, purpose: 'backup' })
  );
  const { updateMediaLibraryEntrySafely } = await import('../media-hub/store');
  await expect(
    updateMediaLibraryEntrySafely(f.media.id, { filename: 'renamed.png' })
  ).rejects.toMatchObject({ status: 423 });
  expect(f.table('media_library').get(f.media.id)).toEqual(f.media);
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
  await updateMediaLibraryEntrySafely(f.media.id, { filename: 'renamed.png' });
  expect(f.table('media_library').get(f.media.id)).toMatchObject({
    filename: 'renamed.png',
    blob: expect.any(Blob),
  });
});
it('moves and restores an unloaded inline screenshot through actual Trash capture', async () => {
  const f = await fixture(true);
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  io.preparePublication.mockImplementation(async () =>
    prepareNativeEditingRoot({ ...f.args, purpose: 'backup' })
  );
  const { moveLibraryItemsToTrash, restoreLibraryTrashItems } = await import('../media-hub/trash');
  await moveLibraryItemsToTrash([{ kind: 'media', id: f.media.id }]);
  expect(f.table('media_library').get(f.media.id)).toMatchObject({
    lifecycle: { trashedAt: expect.any(Number) },
  });
  await restoreLibraryTrashItems([{ kind: 'media', id: f.media.id }]);
  const media = f.table('media_library').get(f.media.id);
  expect(media).toMatchObject({ blob: expect.any(Blob) });
  expect(media).not.toHaveProperty('lifecycle.trashedAt');
  expect(f.remote.read).toHaveBeenCalledOnce();
});

it('does not recreate a root deleted after preparation and before its metadata writer', async () => {
  const f = await fixture(true);
  vi.stubGlobal('__SNIPTALE_SECURITY_E2E__', true);
  io.preparePublication.mockImplementation(async () => {
    await prepareNativeEditingRoot({ ...f.args, purpose: 'backup' });
    f.table('media_library').delete(f.media.id);
  });
  const beforeCapture = structuredClone(f.table('sync_capture'));
  const { updateMediaLibraryEntrySafely } = await import('../media-hub/store');
  await expect(
    updateMediaLibraryEntrySafely(f.media.id, { filename: 'late.png' })
  ).rejects.toThrow();
  expect(f.table('media_library').has(f.media.id)).toBe(false);
  expect(f.table('sync_capture')).toEqual(beforeCapture);
});

it('includes a project-retained export in the original budget, pin guard and manual release', async () => {
  const f = await fixture();
  await prepareNativeEditingRoot(f.args);
  const exported = await additionalCacheFile(f);
  const entry = createProjectExportEntry({
    id: 'retained-export',
    projectId: 'retained-project',
    assetId: exported.assetId,
    size: exported.size,
    mimeType: exported.mimeType,
  });
  f.table('asset_refs').set(exported.assetId, exported);
  f.table('project_exports').set(entry.id, entry);
  f.table('asset_owners').set(JSON.stringify(['project-export', entry.id, 'body']), {
    ownerKind: 'project-export',
    ownerId: entry.id,
    role: 'body',
    assetId: exported.assetId,
  });
  await writeReadyJournal({
    assetRefs: [exported],
    createdAt: 1,
    domain: 'image-workspace',
    journalId: 'retained-export-fixture-completed',
    payload: { aggregateId: entry.id },
  });
  await deleteReadyJournal('retained-export-fixture-completed');
  await releaseAssetReadyProtection([exported.assetId]);
  const project = createVideoProjectEntryWithMediaClip({ id: entry.projectId });
  project.project.assets[0]!.type = VideoProjectAssetType.IMAGE;
  project.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media.id };
  project.project.assets[0]!.metadata = {
    ...project.project.assets[0]!.metadata,
    size: f.ref.size,
    mimeType: f.ref.mimeType,
    duration: null,
  };
  f.table('video_projects').set(project.id, project);
  const root = { rootKind: 'video-project' as const, rootId: project.id };
  const rootKey = captureRootKey('space', root.rootKind, root.rootId);
  f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId: 'space',
    ...root,
    rootKey,
    generation: 1,
    basis: ['project-op'],
  });
  const index = cacheIndex(f);
  index.operations.set('project-op', root);
  const source = index.copies.get(`${f.copy.remote.sha256}:3`)![0]!;
  const digest = createHash('sha256').update('xyz').digest('hex');
  index.copies.set(`${digest}:3`, [
    {
      ...source,
      operationId: 'project-op',
      objectId: 'export',
      remoteKey: 'extra',
      sha256: digest,
    },
  ]);
  f.remote.read.mockImplementation(async (key) =>
    new Blob([key === 'extra' ? 'xyz' : 'abc']).stream()
  );
  await setNativeCacheRootPinned(root, true);
  expect(await readNativeCacheStatus()).toMatchObject({ residentBytes: 6, pinnedBytes: 6 });
  expect(await releaseNativeEditingRoot({ ...f.args, root, index })).toMatchObject({
    released: 0,
    protected: 2,
  });
  await setNativeCacheRootPinned(root, false);
  expect(await releaseNativeEditingRoot({ ...f.args, root, index })).toMatchObject({
    released: 2,
    releasedBytes: 6,
  });
  expect(f.table('project_exports').get(entry.id)).toEqual(entry);
  expect(f.table('asset_refs').get(exported.assetId)).toEqual(exported);
});

it.each([false, true])(
  'prepares exact frozen outgoing bytes after native source deletion=%s without recreating its rows',
  async (deleted) => {
    const f = await fixture();
    const { captureMediaInTransaction } =
      await import('../../composition/persistence/sync-capture/capture');
    const { releaseMediaSource } =
      await import('../../composition/persistence/media-library/delete-cascade.sources');
    const { buildPhysicalDeleteOperation } = await import('../../composition/persistence/assets');
    const tx = f.database.transaction([...EXPECTED_STORES], 'readwrite');
    const native = tx as unknown as Parameters<typeof captureMediaInTransaction>[0];
    const capture = await captureMediaInTransaction(native, f.media.id);
    expect(capture).not.toBeNull();
    if (!capture) throw new Error('Expected native capture.');
    if (deleted) {
      await releaseMediaSource(native, f.media, buildPhysicalDeleteOperation([]));
      await native.objectStore('media_library').delete(f.media.id);
    }
    await tx.done;
    expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
    const beforeDomain = structuredClone([
      f.table('media_library'),
      f.table('asset_refs'),
      f.table('asset_owners'),
    ]);
    const { prepareCapturedOutgoing } = await import('./outgoing');
    const prepared = await prepareCapturedOutgoing(capture, {
      remote: f.remote,
      authorization: f.args.authorization,
      signal: f.args.signal,
    });
    expect(prepared.objects.some((object) => object.sha256 === f.copy.remote.sha256)).toBe(true);
    expect([f.table('media_library'), f.table('asset_refs'), f.table('asset_owners')]).toEqual(
      beforeDomain
    );
    expect(await (await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).text()).toBe(
      'abc'
    );
    expect(f.remote.read).toHaveBeenCalledExactlyOnceWith(f.copy.remote.key, f.args.signal);
    await prepareCapturedOutgoing(capture, {
      remote: f.remote,
      authorization: f.args.authorization,
      signal: f.args.signal,
    });
    expect(f.remote.read).toHaveBeenCalledOnce();
  }
);

async function captureUnloadedSource(f: Awaited<ReturnType<typeof fixture>>, deleted = false) {
  const { captureMediaInTransaction } =
    await import('../../composition/persistence/sync-capture/capture');
  const { releaseMediaSource } =
    await import('../../composition/persistence/media-library/delete-cascade.sources');
  const { buildPhysicalDeleteOperation } = await import('../../composition/persistence/assets');
  const tx = f.database.transaction([...EXPECTED_STORES], 'readwrite');
  const native = tx as unknown as Parameters<typeof captureMediaInTransaction>[0];
  const capture = await captureMediaInTransaction(native, f.media.id);
  if (!capture) throw new Error('Expected native capture.');
  if (deleted) {
    await releaseMediaSource(native, f.media, buildPhysicalDeleteOperation([]));
    await native.objectStore('media_library').delete(f.media.id);
  }
  await tx.done;
  return capture;
}

it.each(['capture', 'connection', 'ref', 'copy', 'namespace'] as const)(
  'refuses changed %s before fetching a frozen original',
  async (change) => {
    const f = await fixture();
    const capture = await captureUnloadedSource(f, true);
    if (change === 'capture') f.table('sync_capture').delete(capture.key);
    if (change === 'connection') f.table('sync_connection').delete('connection');
    if (change === 'ref') f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    if (change === 'copy') f.table('asset_residency').delete(f.copy.id);
    if (change === 'namespace')
      f.table('asset_residency').set(f.copy.id, {
        ...f.copy,
        remote: {
          ...f.copy.remote,
          binding: { ...f.copy.remote.binding, rootUrl: 'https://other.example.test/root/' },
        },
      });
    const before = structuredClone(f.rows);
    const { prepareCapturedOutgoing } = await import('./outgoing');
    await expect(
      prepareCapturedOutgoing(capture, {
        remote: f.remote,
        authorization: f.args.authorization,
        signal: f.args.signal,
      })
    ).rejects.toThrow();
    expect(f.remote.read).not.toHaveBeenCalled();
    expect(f.objects.entriesByName.size).toBe(0);
    expect(f.rows).toEqual(before);
  }
);

it.each(['capture', 'connection', 'ref', 'copy'] as const)(
  'refuses changed %s during frozen-file download and discards only staging',
  async (change) => {
    const f = await fixture();
    const capture = await captureUnloadedSource(f, true);
    f.remote.read.mockImplementationOnce(async () => {
      if (change === 'capture') f.table('sync_capture').delete(capture.key);
      if (change === 'connection') f.table('sync_connection').delete('connection');
      if (change === 'ref') f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
      if (change === 'copy')
        f.table('asset_residency').set(f.copy.id, { ...f.copy, operationId: 'replaced-copy' });
      return new Blob(['abc']).stream();
    });
    const { prepareCapturedOutgoing } = await import('./outgoing');
    await expect(
      prepareCapturedOutgoing(capture, {
        remote: f.remote,
        authorization: f.args.authorization,
        signal: f.args.signal,
      })
    ).rejects.toThrow();
    expect(f.remote.read).toHaveBeenCalledOnce();
    expect(f.objects.entriesByName.size).toBe(0);
    expect(f.table('media_library').has(f.media.id)).toBe(false);
    expect(f.table('asset_owners').size).toBe(0);
  }
);

it('refuses wrong frozen-file SHA and keeps the retained capture available for retry', async () => {
  const f = await fixture();
  const capture = await captureUnloadedSource(f, true);
  f.remote.read.mockResolvedValueOnce(new Blob(['bad']).stream());
  const before = structuredClone(f.rows);
  const { prepareCapturedOutgoing } = await import('./outgoing');
  const recovery = { remote: f.remote, authorization: f.args.authorization, signal: f.args.signal };
  await expect(prepareCapturedOutgoing(capture, recovery)).rejects.toThrow('checksum');
  expect(f.rows).toEqual(before);
  expect(f.objects.entriesByName.size).toBe(0);
  const prepared = await prepareCapturedOutgoing(capture, recovery);
  expect(prepared.objects.some((object) => object.sha256 === f.copy.remote.sha256)).toBe(true);
});

it('retries a frozen capture after physical install and failed copy settlement without another GET', async () => {
  const f = await fixture();
  const capture = await captureUnloadedSource(f, true);
  const beforeDomain = structuredClone([
    f.table('media_library'),
    f.table('asset_refs'),
    f.table('asset_owners'),
  ]);
  const { prepareCapturedOutgoing } = await import('./outgoing');
  const recovery = { remote: f.remote, authorization: f.args.authorization, signal: f.args.signal };
  f.fail();
  await expect(prepareCapturedOutgoing(capture, recovery)).rejects.toThrow();
  expect(await (await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).text()).toBe('abc');
  expect(f.table('asset_residency').get(f.copy.id)).toEqual(f.copy);
  f.allow();
  const prepared = await prepareCapturedOutgoing(capture, recovery);
  expect(prepared.objects.some((object) => object.sha256 === f.copy.remote.sha256)).toBe(true);
  expect(f.remote.read).toHaveBeenCalledOnce();
  expect([f.table('media_library'), f.table('asset_refs'), f.table('asset_owners')]).toEqual(
    beforeDomain
  );
});

it.each([false, true])(
  'encodes a frozen project with its unloaded saved export after project deletion=%s',
  async (deleted) => {
    const f = await fixture();
    const exportedRef: AssetRef = {
      ...f.ref,
      assetId: 'project-retained-export',
      location: { kind: 'opfs', objectKey: 'objects/project-retained-export' },
    };
    const project = createVideoProjectEntryWithMediaClip({ id: 'frozen-project' });
    project.project.assets[0]!.type = VideoProjectAssetType.IMAGE;
    project.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media.id };
    project.project.assets[0]!.metadata = {
      ...project.project.assets[0]!.metadata,
      size: f.ref.size,
      mimeType: f.ref.mimeType,
      duration: null,
    };
    const entry = createProjectExportEntry({
      id: 'project-retained-export',
      projectId: project.id,
      assetId: exportedRef.assetId,
      mimeType: exportedRef.mimeType,
      size: exportedRef.size,
    });
    f.table('video_projects').set(project.id, project);
    f.table('project_exports').set(entry.id, entry);
    f.table('asset_refs').set(exportedRef.assetId, exportedRef);
    f.table('asset_owners').set(JSON.stringify(['project-export', entry.id, 'body']), {
      assetId: exportedRef.assetId,
      ownerKind: 'project-export',
      ownerId: entry.id,
      role: 'body',
    });
    const copy = {
      ...f.copy,
      id: assetResidencyCopyId({ kind: 'opfs', ref: exportedRef }),
      target: { kind: 'opfs' as const, ref: exportedRef },
    };
    f.table('asset_residency').set(copy.id, copy);
    const { captureMediaInTransaction, captureVideoProjectInTransaction } =
      await import('../../composition/persistence/sync-capture/capture');
    const tx = f.database.transaction([...EXPECTED_STORES], 'readwrite');
    const native = tx as unknown as Parameters<typeof captureMediaInTransaction>[0];
    await captureMediaInTransaction(native, f.media.id);
    const capture = await captureVideoProjectInTransaction(native, project.id);
    if (!capture || capture.phase !== 'native' || capture.change.kind !== 'video-project')
      throw new Error('Expected project capture.');
    expect(capture.change.rows.exports.map((item) => item.id)).toEqual([entry.id]);
    if (deleted) {
      const { deleteVideoProjectInTransaction } =
        await import('../../composition/persistence/projects/index.delete');
      const { releaseMediaSource } =
        await import('../../composition/persistence/media-library/delete-cascade.sources');
      const { buildPhysicalDeleteOperation } = await import('../../composition/persistence/assets');
      const operation = buildPhysicalDeleteOperation([]);
      await deleteVideoProjectInTransaction(native, project.id, operation);
      await releaseMediaSource(
        native,
        {
          id: `export:${entry.id}`,
          source: { kind: 'project-export', projectId: project.id, exportId: entry.id },
        },
        operation
      );
    }
    await tx.done;
    const beforeDomain = structuredClone([
      f.table('video_projects'),
      f.table('project_exports'),
      f.table('asset_refs'),
      f.table('asset_owners'),
    ]);
    const { prepareCapturedOutgoing } = await import('./outgoing');
    const prepared = await prepareCapturedOutgoing(capture, {
      remote: f.remote,
      authorization: f.args.authorization,
      signal: f.args.signal,
    });
    expect(
      prepared.objects.some(
        (item) => item.ref.assetId === exportedRef.assetId && item.sha256 === copy.remote.sha256
      )
    ).toBe(true);
    expect([
      f.table('video_projects'),
      f.table('project_exports'),
      f.table('asset_refs'),
      f.table('asset_owners'),
    ]).toEqual(beforeDomain);
    const { parseSyncOperationText } = await import('./wire-record');
    const { parsePortableVideoProjectMetadata } =
      await import('../media-hub-backup/v6/root-codecs/projects');
    const wire = await parseSyncOperationText(prepared.recordText);
    if (!wire.envelope) throw new Error('Expected portable envelope.');
    expect(
      parsePortableVideoProjectMetadata(wire.envelope.metadata).projectExports.map(
        (item) => item.entry.id
      )
    ).toEqual([entry.id]);
  }
);

it.each([true, false])(
  'retries an owned interrupted zero file and preserves an unknown zero file, marked=%s',
  async (marked) => {
    const f = await fixture();
    const capture = await captureUnloadedSource(f, true);
    if (marked) {
      const { restoreNativeOutgoingAsset } =
        await import('../../composition/persistence/sync-capture/outgoing');
      await expect(
        restoreNativeOutgoingAsset({
          capture,
          copy: f.copy,
          authorization: f.args.authorization,
          sourceBlob: new Blob(['bad']),
        })
      ).rejects.toThrow('checksum');
    } else await f.objects.getFileHandle(f.ref.assetId, { create: true });
    expect((await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).size).toBe(0);
    const { prepareCapturedOutgoing } = await import('./outgoing');
    const pending = prepareCapturedOutgoing(capture, {
      remote: f.remote,
      authorization: f.args.authorization,
      signal: f.args.signal,
    });
    if (marked) {
      const prepared = await pending;
      expect(prepared.objects.some((item) => item.sha256 === f.copy.remote.sha256)).toBe(true);
      expect(await (await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).text()).toBe(
        'abc'
      );
    } else {
      await expect(pending).rejects.toThrow('Existing asset bytes');
      expect((await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).size).toBe(0);
      expect(f.objects.entriesByName.size).toBe(1);
    }
    expect(f.table('media_library').has(f.media.id)).toBe(false);
    expect(f.table('asset_owners').size).toBe(0);
  }
);

it.each([true, false])(
  'ordinary opening retries only an owned interrupted zero original, marked=%s',
  async (marked) => {
    const f = await fixture();
    const capture = await captureUnloadedSource(f);
    const beforeDomain = structuredClone([
      f.table('media_library'),
      f.table('asset_refs'),
      f.table('asset_owners'),
    ]);
    if (marked) {
      const { restoreNativeOutgoingAsset } =
        await import('../../composition/persistence/sync-capture/outgoing');
      await expect(
        restoreNativeOutgoingAsset({
          capture,
          copy: f.copy,
          authorization: f.args.authorization,
          sourceBlob: new Blob(['bad']),
        })
      ).rejects.toThrow('checksum');
    } else await f.objects.getFileHandle(f.ref.assetId, { create: true });
    const pending = prepareNativeEditingRoot(f.args);
    if (marked) {
      await expect(pending).resolves.toEqual({ downloaded: 1 });
      expect(await isNativeEditingRootReady(f.args.root)).toBe(true);
    } else {
      await expect(pending).rejects.toThrow('Existing asset bytes');
      expect((await (await f.objects.getFileHandle(f.ref.assetId)).getFile()).size).toBe(0);
    }
    expect([f.table('media_library'), f.table('asset_refs'), f.table('asset_owners')]).toEqual(
      beforeDomain
    );
  }
);

it('drains frozen-file preparation under one transition before queued erasure', async () => {
  const f = await fixture();
  const capture = await captureUnloadedSource(f, true);
  const { installPersistenceLockManagerForTests, runWithPersistentDataErasureBarrier } =
    await import('../../composition/persistence/infrastructure/mutation-barrier');
  let held = 0;
  let sharedRequests = 0;
  let erasureQueued = false;
  let erased = false;
  let releaseErasure: (() => void) | undefined;
  let erasure: Promise<void> | undefined;
  installPersistenceLockManagerForTests({
    async request(name, options, operation) {
      if (!name.endsWith(':transition')) return operation();
      if (options.mode === 'exclusive' && held > 0) {
        erasureQueued = true;
        return new Promise((resolve, reject) => {
          releaseErasure = () => {
            Promise.resolve().then(operation).then(resolve, reject);
          };
        });
      }
      if (options.mode === 'shared') {
        sharedRequests++;
        if (erasureQueued) throw new Error('Nested transition would wait behind erasure.');
        held++;
        try {
          return await operation();
        } finally {
          if (--held === 0) releaseErasure?.();
        }
      }
      return operation();
    },
  });
  f.remote.read.mockImplementationOnce(async () => {
    erasure = runWithPersistentDataErasureBarrier(async () => {
      erased = true;
    });
    expect(erased).toBe(false);
    return new Blob(['abc']).stream();
  });
  try {
    const { prepareCapturedOutgoing } = await import('./outgoing');
    const prepared = await prepareCapturedOutgoing(capture, {
      remote: f.remote,
      authorization: f.args.authorization,
      signal: f.args.signal,
    });
    expect(prepared.objects.some((item) => item.sha256 === f.copy.remote.sha256)).toBe(true);
    await erasure;
    expect(erased).toBe(true);
    expect(sharedRequests).toBe(1);
  } finally {
    installPersistenceLockManagerForTests(null);
  }
});

it.each(['temporary', 'busy'] as const)(
  'queues a delayed retry for frozen-file %s refusal and publishes after explicit retry',
  async (refusal) => {
    const f = await fixture();
    const capture = await captureUnloadedSource(f, true);
    const beforeDomain = structuredClone([
      f.table('media_library'),
      f.table('asset_refs'),
      f.table('asset_owners'),
    ]);
    const bodies = new Map<string, Blob>([[f.copy.remote.key, new Blob(['abc'])]]);
    f.remote.stat.mockImplementation(async (key) => {
      const body = bodies.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return { size: body.size };
    });
    f.remote.read.mockImplementation(async (key) => {
      const body = bodies.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return body.stream();
    });
    f.remote.write.mockImplementation(async (key, body) => {
      bodies.set(key, body);
    });
    let busy = refusal === 'busy';
    if (refusal === 'temporary')
      f.remote.read.mockRejectedValueOnce(new SyncRemoteError('temporary', 503));
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: navigator.storage,
      locks: {
        request: async (
          name: string,
          options: LockOptions,
          operation: (lock: object | null) => unknown
        ) => operation(busy && options.ifAvailable && name.includes(f.ref.assetId) ? null : {}),
      },
    });
    const { enqueueSyncQueueOperation, commandSyncQueueOperation } =
      await import('../../composition/persistence/sync-capture/queue');
    const { runSyncQueueOperation } = await import('./queue');
    const scope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
    const enqueued = await enqueueSyncQueueOperation(capture);
    const authorize = vi.fn(async () => undefined);
    const execute = (revision: number) =>
      runSyncQueueOperation({
        scope,
        operationId: capture.operationId,
        expectedRevision: revision,
        authorization: f.args.authorization,
        remote: f.remote,
        signal: f.args.signal,
        authorize,
      });
    const refused = await execute(enqueued.revision);
    if (refused.status !== 'finished') throw new Error('Expected a settled queue refusal.');
    expect(refused.operation).toMatchObject({
      status: 'failed',
      failureCode: 'temporary',
      stage: 'preparing',
    });
    expect(refused.operation.nextDueAt).toBeGreaterThan(Date.now());
    expect(f.remote.write).not.toHaveBeenCalled();
    expect(authorize).toHaveBeenCalled();
    expect([f.table('media_library'), f.table('asset_refs'), f.table('asset_owners')]).toEqual(
      beforeDomain
    );
    busy = false;
    const retry = await commandSyncQueueOperation(
      scope,
      capture.operationId,
      refused.operation.revision,
      'retry'
    );
    expect(await execute(retry.revision)).toMatchObject({
      status: 'finished',
      operation: { status: 'published' },
    });
    expect([f.table('media_library'), f.table('asset_refs'), f.table('asset_owners')]).toEqual(
      beforeDomain
    );
  }
);

async function receiveFixture() {
  const f = await fixture();
  for (const name of ['media_library', 'asset_refs', 'asset_owners', 'asset_residency'])
    f.table(name).clear();
  for (const key of f.table('sync_capture').keys())
    if (key !== 'profile') f.table('sync_capture').delete(key);
  f.remote.read.mockImplementation(async () => new Blob([new Uint8Array(3)]).stream());
  const catalog = (attempts: CatalogAttempt[]) => ({
    ...projectSyncCatalog('space', attempts),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  });
  const receive = (selected: CatalogAttempt, attempts: CatalogAttempt[], residentOnly?: true) =>
    receiveSelectedCatalogRoot({
      remote: f.remote,
      catalog: catalog(attempts),
      scope: f.args.binding,
      authorization: f.args.authorization,
      signal: f.args.signal,
      selection: {
        rootKind: selected.operation.rootKind,
        rootId: selected.operation.rootId,
        operationId: selected.operation.operationId,
        sourceDigest: hashSyncText(selected.operationText),
      },
      ...(residentOnly ? { residentOnly } : {}),
    });
  return { ...f, catalog, receive };
}

it.each(['normal', 'temporary-refusal'] as const)(
  'receives a new Montage after a completed media dependency is unloaded: %s',
  async (mode) => {
    const f = await receiveFixture();
    const media = await attempt(mediaEnvelope().envelope, 'media-op');
    await f.receive(media, [media]);
    const native = f.table('media_library').get(media.operation.rootId);
    if (!native || typeof native !== 'object' || !('source' in native))
      throw new Error('Expected received media');
    const refs = [...f.table('asset_refs').values()]
      .map(parseAssetRef)
      .filter((ref) => ref !== null);
    expect(refs).toHaveLength(1);
    const original = refs[0]!;
    const owners = structuredClone(f.table('asset_owners'));
    const state = structuredClone(f.table('sync_capture'));
    const root = { rootKind: 'media' as const, rootId: media.operation.rootId };
    await expect(
      releaseNativeEditingRoot({
        ...f.args,
        root,
        index: indexCatalogCopies(f.catalog([media]), 'space'),
      })
    ).resolves.toMatchObject({ released: 1, releasedBytes: 3 });
    await expect(readAssetFile(original, 'original.png')).rejects.toThrow();
    const parent = await attempt(projectEnvelope(), 'project-op', 2);
    const attempts = [media, parent];
    f.remote.read.mockClear();
    if (mode === 'temporary-refusal') {
      f.remote.read.mockRejectedValueOnce(new SyncRemoteError('temporary', 423));
      await expect(f.receive(parent, attempts)).rejects.toThrow('temporary');
      expect(f.table('video_projects').size).toBe(0);
      expect(f.table('asset_owners')).toEqual(owners);
      expect(f.table('sync_capture')).toEqual(state);
      expect(f.table('asset_refs').get(original.assetId)).toEqual(original);
    }
    await f.receive(parent, attempts);
    expect(f.table('video_projects').has('project')).toBe(true);
    expect(await isNativeEditingRootReady({ rootKind: 'video-project', rootId: 'project' })).toBe(
      true
    );
    expect(f.table('asset_refs').get(original.assetId)).toEqual(original);
    for (const [key, owner] of owners) expect(f.table('asset_owners').get(key)).toEqual(owner);
    expect(
      new Uint8Array(await (await readAssetFile(original, 'original.png')).arrayBuffer())
    ).toEqual(new Uint8Array(3));
    expect(
      f.table('asset_residency').get(assetResidencyCopyId({ kind: 'opfs', ref: original }))
    ).toMatchObject({ phase: 'resident' });
    expect(f.remote.read.mock.calls.map(([key]) => key)).toContain(media.objects[0]!.remoteKey);
  }
);

it.each(['normal', 'temporary-refusal'] as const)(
  'receives an unloaded Guide successor without replacing a shared original: %s',
  async (mode) => {
    const f = await receiveFixture();
    const project = createGuideProject('Guide', 'received-guide', 1);
    const step = createGuideStep('Image', 'image-step');
    step.blocks.push(
      createGuideImageBlock({
        id: 'image-block',
        assetId: 'received-child',
        width: 10,
        height: 10,
        source: { kind: 'import', filename: 'body.png' },
      })
    );
    project.items.push(step);
    const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 });
    const child = {
      id: 'received-child',
      projectId: project.id,
      galleryAssetId: null,
      mimeType: 'image/png',
      size: 3,
      width: 10,
      height: 10,
      createdAt: 1,
    };
    const envelope = parseRootEnvelope({
      descriptor: {
        rootKind: 'scenario-project',
        rootId: project.id,
        metadataPath: 'Metadata/root.json',
        objectCount: 1,
        totalBytes: 3,
      },
      metadata: {
        entry: encodePortableScenarioProjectEntry(entry),
        assets: [{ entry: child, objectId: 'body' }],
        stepDocuments: [],
        exports: [],
        exportThumbnails: [],
      },
      objects: [object('body', 'body.png')],
    });
    const before = await attempt(envelope, 'guide-before');
    await f.receive(before, [before]);
    const previous = parseScenarioAssetEntry(f.table('scenario_assets').get(child.id));
    if (!previous) throw new Error('Expected received Scenario asset');
    const ref = parseAssetRef(f.table('asset_refs').get(previous.assetId));
    if (!ref) throw new Error('Expected native Scenario ref');
    const sharedProject = structuredClone(project);
    sharedProject.id = 'shared-guide';
    const sharedStep = structuredClone(step);
    sharedStep.blocks[0] = createGuideImageBlock({
      id: 'shared-image-block',
      assetId: 'shared-child',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'body.png' },
    });
    sharedProject.items = [sharedStep];
    f.table('scenario_projects').set(
      sharedProject.id,
      createScenarioProjectEntry({ project: sharedProject, existing: undefined, updatedAt: 1 })
    );
    f.table('scenario_assets').set('shared-child', {
      ...previous,
      id: 'shared-child',
      projectId: sharedProject.id,
    });
    const sharedOwner = JSON.stringify(['scenario-asset', 'shared-child', 'body']);
    f.table('asset_owners').set(sharedOwner, {
      ownerKind: 'scenario-asset',
      ownerId: 'shared-child',
      role: 'body',
      assetId: ref.assetId,
    });
    await expect(
      releaseNativeEditingRoot({
        ...f.args,
        root: { rootKind: 'scenario-project', rootId: project.id },
        index: indexCatalogCopies(f.catalog([before]), 'space'),
      })
    ).resolves.toMatchObject({ released: 1, releasedBytes: 3 });
    await expect(readAssetFile(ref, 'body.png')).rejects.toThrow();
    const successor = parseRootEnvelope({
      ...envelope,
      metadata: {
        assets: [{ entry: child, objectId: 'body' }],
        stepDocuments: [],
        exports: [],
        exportThumbnails: [],
        entry: encodePortableScenarioProjectEntry(
          createScenarioProjectEntry({
            project: { ...project, name: 'Renamed guide' },
            existing: entry,
            updatedAt: 2,
            historyPolicy: 'preserve',
          })
        ),
      },
    });
    const after = await attempt(parseRootEnvelope(successor), 'guide-after', 2, ['guide-before']);
    const attempts = [before, after];
    const owners = structuredClone(f.table('asset_owners'));
    const state = structuredClone(f.table('sync_capture'));
    f.remote.read.mockClear();
    if (mode === 'temporary-refusal') {
      f.remote.read.mockRejectedValueOnce(new SyncRemoteError('temporary', 423));
      await expect(f.receive(after, attempts)).rejects.toThrow('temporary');
      expect(f.table('asset_owners')).toEqual(owners);
      expect(f.table('sync_capture')).toEqual(state);
      expect(parseScenarioAssetEntry(f.table('scenario_assets').get(child.id))?.assetId).toBe(
        ref.assetId
      );
    }
    await f.receive(after, attempts);
    expect(parseScenarioAssetEntry(f.table('scenario_assets').get(child.id))?.assetId).toBe(
      ref.assetId
    );
    expect(f.table('asset_owners').get(sharedOwner)).toMatchObject({ assetId: ref.assetId });
    expect(f.table('asset_refs').get(ref.assetId)).toEqual(ref);
    expect(new Uint8Array(await (await readAssetFile(ref, 'body.png')).arrayBuffer())).toEqual(
      new Uint8Array(3)
    );
    expect(
      f.table('asset_residency').get(assetResidencyCopyId({ kind: 'opfs', ref }))
    ).toMatchObject({ phase: 'resident' });
    expect(f.remote.read.mock.calls.map(([key]) => key)).toContain(after.objects[0]!.remoteKey);
  }
);
