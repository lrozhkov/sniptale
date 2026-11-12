import '../../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installPersistenceLockManagerForTests } from '../../../../composition/persistence/infrastructure/mutation-barrier';
import { runVisualCatalogMutation } from '../../../../composition/persistence/effect-bundles/preferences';
import {
  readValidAnimationSourceEntry,
  createValidGlPresetSourceEntry,
} from '../../../../composition/persistence/effect-bundles/fixture.test-support';
import {
  encodeEffectBundleMetadata,
  visualCatalogMetadataRootId,
} from '../root-codecs/effect-bundle';
import type { AnimationCatalogEntry } from '../../../../features/video/project/effect-bundle/catalog';
import type { GlPresetCatalogEntry } from '../../../../composition/persistence/effect-bundles/gl-presets';
import type { VisualCatalogPreference } from '../../../../features/video/project/effect-bundle/catalog/presets';
import type {
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../../composition/persistence/assets';
import type { JsonValue } from '../contracts';
const mocks = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  read: vi.fn(),
  checkpoint: vi.fn(),
  fail: false,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => {
    if (!mocks.db) throw Error('Missing fixture database');
    return mocks.db;
  },
}));
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.read,
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
}));
import { effectBundleRootPublisher } from './effect-bundle';
let name = '',
  serial = 0;
const animation = 'video_animation_packages',
  transition = 'video_gl_transition_presets',
  preferences = 'video_visual_preferences',
  operations = 'asset_operations';
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.fail = false;
  name = `visual-root-publication-${++serial}`;
  mocks.db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore(animation, { keyPath: 'packId' });
      db.createObjectStore(transition, { keyPath: 'id' });
      db.createObjectStore(preferences, { keyPath: ['kind', 'packId'] });
      db.createObjectStore(operations, { keyPath: 'id' });
    },
  });
  mocks.checkpoint.mockImplementation(async (store, operationId, root) => {
    await store.put({ id: operationId, ...root });
    if (mocks.fail) throw Error('Checkpoint refused');
  });
  const queues = new Map<string, Promise<unknown>>();
  installPersistenceLockManagerForTests({
    request(name, options, operation) {
      if (options.mode === 'shared') return Promise.resolve().then(operation);
      const pending = (queues.get(name) ?? Promise.resolve()).then(operation);
      queues.set(
        name,
        pending.catch(() => undefined)
      );
      return pending;
    },
  });
});
afterEach(async () => {
  mocks.db?.close();
  mocks.db = null;
  await deleteDB(name);
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
});
function args(
  entry: AnimationCatalogEntry | GlPresetCatalogEntry,
  preference?: VisualCatalogPreference
) {
  const sources =
      entry.format === 'sniptale-animation-catalog'
        ? entry.documents.map((doc) => doc.source)
        : [entry.source],
    ids = sources.map((_, i) => `source-${i}`),
    metadata = encodeEffectBundleMetadata({
      entry,
      objectIds: ids,
      ...(preference ? { preference } : {}),
    }),
    rootId = visualCatalogMetadataRootId(metadata);
  const blobs = new Map(
    ids.map((id, i) => [id, new Blob([sources[i]!], { type: 'application/json' })])
  );
  mocks.read.mockImplementation(async (_ref, id) => {
    const blob = blobs.get(id);
    if (!blob) throw Error('Missing source object');
    return blob;
  });
  const session = {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: `media:effect-bundle:${rootId}`,
    kind: 'archive-restore-session',
    operationId: 'restore-one',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: 'replace',
    updatedAt: 1,
  } satisfies ArchiveRestoreSession;
  const journal = {
    assetRefs: [],
    createdAt: 1,
    domain: 'archive-restore',
    journalId: 'journal-one',
    payload: {},
  } satisfies AssetReadyJournal;
  return {
    envelope: {
      descriptor: {
        mediaSubtype: 'effect-bundle' as const,
        metadataPath: `_sniptale/metadata/media/effect-bundle-${encodeURIComponent(rootId)}.json`,
        objectCount: sources.length,
        rootId,
        rootKind: 'media' as const,
        totalBytes: sources.reduce(
          (sum, source) => sum + new TextEncoder().encode(source).byteLength,
          0
        ),
      },
      metadata: metadata as unknown as JsonValue,
      objects: [],
    },
    session,
    journal,
    staged: ids.map((id) => ({
      objectId: id,
      ref: {
        assetId: id,
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: `objects/${id}` },
        mimeType: 'application/json',
        sha256: null,
        size: blobs.get(id)!.size,
      },
    })),
  };
}
it.each([false, true])(
  'publishes real sources/preferences/checkpoint atomically; checkpoint refusal=%s',
  async (refused) => {
    const entry = await readValidAnimationSourceEntry(),
      doc = entry.documents[0]!,
      preference: VisualCatalogPreference = {
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'animation',
        packId: entry.packId,
        documents: { [doc.id]: { sourceSha256: doc.sha256, enabled: false } },
      },
      input = args(entry, preference);
    mocks.fail = refused;
    const operation = effectBundleRootPublisher.publish(input);
    if (refused) {
      await expect(operation).rejects.toThrow('Checkpoint refused');
      expect(await mocks.db!.count(animation)).toBe(0);
      expect(await mocks.db!.count(preferences)).toBe(0);
      expect(await mocks.db!.count(operations)).toBe(0);
      mocks.fail = false;
      await effectBundleRootPublisher.publish(input);
    } else
      await expect(operation).resolves.toEqual({
        imported: true,
        conflicted: false,
        retainedAssetIds: [],
      });
    expect(await mocks.db!.get(animation, entry.packId)).toEqual(entry);
    expect(await mocks.db!.get(preferences, ['animation', entry.packId])).toEqual(preference);
    expect(await mocks.db!.get(operations, 'restore-one')).toMatchObject({
      rootKey: input.session.currentRoot,
      targetRootId: input.envelope.descriptor.rootId,
      imported: true,
    });
  }
);
it('retains future GL data and checkpoints skip without reading source objects', async () => {
  const entry = createValidGlPresetSourceEntry('Future', '99.0.0'),
    input = args(entry);
  await effectBundleRootPublisher.publish(input);
  expect(await mocks.db!.get(transition, entry.id)).toEqual(entry);
  mocks.read.mockClear();
  expect(
    await effectBundleRootPublisher.checkpointSkipIfExisting!({
      envelope: input.envelope,
      session: { ...input.session, strategy: 'skip' },
    })
  ).toBe(true);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(await mocks.db!.get(operations, 'restore-one')).toMatchObject({
    imported: false,
    conflicted: true,
  });
});
it('refuses altered staged bytes before native writes and preserves completed sibling roots', async () => {
  const gl = createValidGlPresetSourceEntry(),
    good = args(gl);
  await effectBundleRootPublisher.publish(good);
  const entry = await readValidAnimationSourceEntry(),
    input = args(entry);
  mocks.read.mockResolvedValue(new Blob(['damaged'], { type: 'application/json' }));
  await expect(effectBundleRootPublisher.publish(input)).rejects.toThrow('size');
  expect(await mocks.db!.count(animation)).toBe(0);
  expect(await mocks.db!.get(transition, gl.id)).toEqual(gl);
});
it('keeps complete delayed source publication ahead of a later catalogue deletion', async () => {
  const entry = createValidGlPresetSourceEntry(),
    input = args(entry),
    entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>();
  const original = mocks.read.getMockImplementation()!;
  mocks.read.mockImplementation(async (...args) => {
    entered.resolve();
    await released.promise;
    return original(...args);
  });
  const pending = effectBundleRootPublisher.publish(input);
  await entered.promise;
  const deletion = runVisualCatalogMutation(async () => {
    const tx = mocks.db!.transaction([transition, preferences], 'readwrite');
    await tx.objectStore(transition).delete(entry.id);
    await tx.objectStore(preferences).delete(['transition', entry.id]);
    await tx.done;
  });
  released.resolve();
  await pending;
  await deletion;
  expect(await mocks.db!.get(transition, entry.id)).toBeUndefined();
  expect(await mocks.db!.count(operations)).toBe(1);
});
