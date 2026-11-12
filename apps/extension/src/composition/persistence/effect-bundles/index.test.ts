import {
  getEffectBundle,
  deleteEffectBundle,
  listImportedEffectBundles as listEffectBundles,
  setEffectBundleEnabled,
  setEffectDocumentEnabled,
} from './index';
import { readFileSync } from 'node:fs';
import { saveEffectPresetPreferences } from './presets';
import {
  mutateVisualCatalogPreference,
  readVisualCatalogPreferences,
  replaceVisualCatalogPreferences,
} from './preferences';
import { importAnimationFiles } from './import-files';
import {
  runWithPersistenceDomainMutationLock,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
const animationImport = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('../../../features/video/project/effect-bundle', async (original) => ({
  ...(await original<typeof import('../../../features/video/project/effect-bundle')>()),
  importAnimationArtifact: animationImport.parse,
}));
import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import {
  saveAnimationArtifact,
  getAnimationCatalogEntry,
  listAnimationCatalogEntries,
  deleteAnimationCatalogEntry,
} from './index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const abort = vi.fn();
  const get = vi.fn();
  const getAll = vi.fn();
  const put = vi.fn();
  const remove = vi.fn();
  const store = { get, getAll, put };
  const transaction = vi.fn<(...args: unknown[]) => unknown>(() => ({
    abort,
    done: Promise.resolve(),
    objectStore: () => store,
  }));
  const db = {
    get: vi.fn(),
    getAll: vi.fn(),
    delete: remove,
    transaction,
  };
  return { abort, db, get, getAll, put, remove, transaction };
});

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: async () => mocks.db,
  VIDEO_EFFECT_BUNDLES_STORE: 'video_effect_bundles',
  VIDEO_ANIMATION_PACKAGES_STORE: 'video_animation_packages',
  VIDEO_VISUAL_PREFERENCES_STORE: 'video_visual_preferences',
}));

beforeEach(() => {
  mocks.abort.mockReset();
  mocks.db.get.mockReset();
  mocks.db.get.mockResolvedValue(undefined);
  mocks.db.getAll.mockReset();
  mocks.get.mockReset();
  mocks.getAll.mockReset();
  mocks.put.mockReset();
  mocks.remove.mockReset();
  mocks.transaction.mockClear();
  mocks.get.mockResolvedValue(undefined);
  mocks.getAll.mockResolvedValue([]);
  mocks.put.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DB55 source-only animation catalog command lifetime', () => {
  let db: IDBPDatabase;
  let databaseName = '';
  let serial = 0;
  const animationStore = 'video_animation_packages';
  const preferenceStore = 'video_visual_preferences';
  const legacyStore = 'video_effect_bundles';
  const legacy = { packId: 'opaque-legacy', bytes: [0, 255, 17], schema: 'sniptale.effect.v1' };
  beforeEach(async () => {
    databaseName = `animation-catalog-command-${++serial}`;
    db = await openDB(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore(animationStore, { keyPath: 'packId' });
        database.createObjectStore(preferenceStore, { keyPath: ['kind', 'packId'] });
        database.createObjectStore(legacyStore, { keyPath: 'packId' });
      },
    });
    await db.put(legacyStore, legacy);
    mocks.db.get.mockImplementation((name, key) => db.get(name, key));
    mocks.db.getAll.mockImplementation((name) => db.getAll(name));
    mocks.remove.mockImplementation((name, key) => db.delete(name, key));
    mocks.transaction.mockImplementation((name, mode) => {
      if (mode !== 'readonly' && mode !== 'readwrite') throw new Error('Invalid fixture mode');
      if (typeof name === 'string') return db.transaction(name, mode);
      if (
        Array.isArray(name) &&
        name.length === 2 &&
        name[0] === animationStore &&
        name[1] === preferenceStore
      )
        return db.transaction([animationStore, preferenceStore], mode);
      throw new Error('Invalid fixture transaction');
    });
    animationImport.parse.mockReset();
    animationImport.parse.mockImplementation(async (file: File) =>
      importAnimationArtifactBytes(new Uint8Array(await file.arrayBuffer()))
    );
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
    expect(await db.getAll(legacyStore)).toEqual([legacy]);
    db.close();
    await deleteDB(databaseName);
    installPersistenceLockManagerForTests(null);
    vi.restoreAllMocks();
  });
  async function artifact(name = 'One') {
    const result = await importAnimationArtifactBytes(
      new TextEncoder().encode(
        JSON.stringify({
          v: '5.12.2',
          fr: 30,
          ip: 0,
          op: 60,
          w: 320,
          h: 180,
          nm: name,
          ddd: 0,
          layers: [],
          assets: [],
        })
      )
    );
    if (!result.ok) throw new Error('Invalid fixture animation');
    return result;
  }
  it('keeps a missing catalogue command inert and validates the storage collection boundary', async () => {
    await setEffectBundleEnabled('absent-package', false);
    expect(await db.getAll(preferenceStore)).toEqual([]);
    mocks.db.getAll.mockResolvedValueOnce(null);
    await expect(listEffectBundles()).rejects.toMatchObject({ code: 'catalogEntryInvalid' });
    const { entry } = await saveAnimationArtifact(await artifact(), 10);
    await deleteEffectBundle(entry.packId);
    expect(await getAnimationCatalogEntry(entry.packId)).toBeNull();
  });
  it('opens and lists source-only animations without reading legacy rows or rewriting sources', async () => {
    const input = await artifact(),
      { entry } = await saveAnimationArtifact(input, 1);
    const original = structuredClone(entry);
    mocks.db.get.mockClear();
    mocks.db.getAll.mockClear();
    const opened = await getEffectBundle(entry.packId);
    expect(opened?.documents).toEqual([
      expect.objectContaining({
        id: entry.documents[0]!.id,
        source: entry.documents[0]!.source,
        sha256: entry.documents[0]!.sha256,
        enabled: true,
      }),
    ]);
    expect(opened?.source).toBe('lottie-json');
    expect(await listEffectBundles()).toEqual([
      expect.objectContaining({ status: 'ready', packId: entry.packId }),
    ]);
    expect(mocks.db.get.mock.calls.every(([store]) => store !== legacyStore)).toBe(true);
    expect(mocks.db.getAll.mock.calls.every(([store]) => store !== legacyStore)).toBe(true);
    expect(await getAnimationCatalogEntry(entry.packId)).toEqual(original);
  });
  it('serializes catalogue availability commands without changing package bytes or sibling presets', async () => {
    const input = await artifact(),
      { entry } = await saveAnimationArtifact(input, 1),
      document = entry.documents[0]!;
    await mutateVisualCatalogPreference('animation', entry.packId, () => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      documents: {
        [document.id]: { sourceSha256: document.sha256, presetPreferences: { presets: [] } },
      },
    }));
    await Promise.all([
      setEffectBundleEnabled(entry.packId, false),
      setEffectDocumentEnabled(entry.packId, document.id, true),
    ]);
    expect((await getEffectBundle(entry.packId))?.documents[0]).toMatchObject({
      enabled: true,
      presetPreferences: { presets: [] },
    });
    expect(await getAnimationCatalogEntry(entry.packId)).toEqual(entry);
    await expect(setEffectDocumentEnabled(entry.packId, 'missing', false)).rejects.toMatchObject({
      code: 'catalogEntryInvalid',
    });
  });
  it(
    'saves supported presets through the catalogue and completes a ' +
      'delayed preset command before deletion',
    async () => {
      const input = await importAnimationArtifactBytes(
        readFileSync(
          'apps/extension/public/video-effects/animations/callout.sniptale-animation.json'
        )
      );
      if (!input.ok) throw new Error('Expected valid shipped animation.');
      const { entry } = await saveAnimationArtifact(input, 1),
        document = entry.documents[0]!,
        template = input.documents[0]!.template;
      const preferences = {
        presets: [{ id: 'mine', name: 'Mine', values: template.controlPresets![0]!.values }],
      };
      const saved = await saveEffectPresetPreferences(
        entry.packId,
        document.id,
        document.sha256,
        preferences
      );
      expect(saved.documents[0]!.presetPreferences).toEqual(preferences);
      expect(await getAnimationCatalogEntry(entry.packId)).toEqual(entry);
      const entered = Promise.withResolvers<void>(),
        released = Promise.withResolvers<void>();
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, bytes) => {
        const verified = await digest(algorithm, bytes);
        entered.resolve();
        await released.promise;
        return verified;
      });
      const pending = saveEffectPresetPreferences(
        entry.packId,
        document.id,
        document.sha256,
        preferences,
        preferences
      );
      await entered.promise;
      const deletion = deleteAnimationCatalogEntry(entry.packId);
      released.resolve();
      await pending;
      await deletion;
      expect(await getAnimationCatalogEntry(entry.packId)).toBeNull();
      expect(await db.get(preferenceStore, ['animation', entry.packId])).toBeUndefined();
    }
  );
  it('keeps incompatible preference references unavailable and refuses availability rebinding', async () => {
    const input = await artifact(),
      { entry } = await saveAnimationArtifact(input, 1),
      document = entry.documents[0]!;
    await mutateVisualCatalogPreference('animation', entry.packId, () => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      documents: {
        [document.id]: {
          sourceSha256: 'f'.repeat(64),
          enabled: false,
          presetPreferences: { presets: [{ id: 'old', name: 'Old', values: { removed: 3 } }] },
        },
      },
    }));
    const before = await db.get(preferenceStore, ['animation', entry.packId]);
    expect((await getEffectBundle(entry.packId))?.documents[0]).toMatchObject({ enabled: true });
    expect((await getEffectBundle(entry.packId))?.documents[0]?.presetPreferences).toBeUndefined();
    await expect(setEffectDocumentEnabled(entry.packId, document.id, false)).rejects.toThrow(
      'catalog changed'
    );
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toEqual(before);
  });
  it('serializes parallel writers and excludes opaque legacy rows from reads and logical quota', async () => {
    const one = await artifact(),
      two = await artifact('Two');
    await Promise.all([saveAnimationArtifact(one, 1), saveAnimationArtifact(two, 2)]);
    expect((await listAnimationCatalogEntries()).map((entry) => entry.label.en)).toEqual([
      'Two',
      'One',
    ]);
  });
  it('orders deletion after an admitted delayed writer, so it cannot republish after deletion', async () => {
    const input = await artifact();
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      started();
      await held;
      return original(algorithm, data);
    });
    const pending = saveAnimationArtifact(input, 1);
    await entered;
    const packId = `animation.${input.documents[0]!.template.id}`;
    const deletion = deleteAnimationCatalogEntry(packId);
    release();
    await pending;
    await deletion;
    expect(await getAnimationCatalogEntry(packId)).toBeNull();
  });
  it('does not restore imported preferences after deletion and same-ID recreation', async () => {
    const input = await artifact();
    const { entry } = await saveAnimationArtifact(input, 1);
    await mutateVisualCatalogPreference('animation', entry.packId, () => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      enabled: false,
      documents: {
        [entry.documents[0]!.id]: {
          sourceSha256: entry.documents[0]!.sha256,
          enabled: false,
          presetPreferences: { presets: [{ id: 'old', name: 'Old preference', values: {} }] },
        },
      },
    }));
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toBeDefined();
    await deleteAnimationCatalogEntry(entry.packId);
    const recreated = await saveAnimationArtifact(input, 2);
    expect(recreated.entry.createdAt).toBe(2);
    expect(Object.hasOwn(recreated.entry, 'enabled')).toBe(false);
    expect(Object.hasOwn(recreated.entry.documents[0]!, 'presetPreferences')).toBe(false);
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toBeUndefined();
  });
  it('deletes a portable package with its authored identity and preferences without touching legacy rows', async () => {
    const input = await artifact();
    input.package = { packId: 'portable.annotations', label: { en: 'Portable annotations' } };
    const { entry } = await saveAnimationArtifact(input, 1);
    expect(entry.packId).toBe('portable.annotations');
    await mutateVisualCatalogPreference('animation', entry.packId, () => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      enabled: false,
      documents: {},
    }));
    await deleteAnimationCatalogEntry(entry.packId);
    expect(await getAnimationCatalogEntry(entry.packId)).toBeNull();
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toBeUndefined();
  });
  it.each(['', '../package', 'builtin:sniptale', 'x'.repeat(193)])(
    'refuses an invalid or builtin deletion identity (%s)',
    async (packId) => {
      const input = await artifact(),
        { entry } = await saveAnimationArtifact(input, 1);
      const calls = mocks.transaction.mock.calls.length;
      await expect(deleteAnimationCatalogEntry(packId)).rejects.toMatchObject({
        code: 'catalogEntryInvalid',
      });
      expect(mocks.transaction.mock.calls.length).toBe(calls);
      expect(await getAnimationCatalogEntry(entry.packId)).toEqual(entry);
    }
  );
  it('rolls back the package deletion when preference deletion fails and permits retry', async () => {
    const input = await artifact(),
      { entry } = await saveAnimationArtifact(input, 1);
    await mutateVisualCatalogPreference('animation', entry.packId, () => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      enabled: false,
      documents: {},
    }));
    const preference = await db.get(preferenceStore, ['animation', entry.packId]);
    mocks.transaction.mockImplementationOnce(() => {
      const tx = db.transaction([animationStore, preferenceStore], 'readwrite');
      return {
        done: tx.done,
        abort: () => tx.abort(),
        objectStore: (name: string) => {
          if (name === animationStore) return tx.objectStore(animationStore);
          if (name !== preferenceStore) throw new Error('Unexpected store');
          return {
            delete: async () => {
              tx.abort();
              await tx.done.catch(() => undefined);
              throw new Error('Preference deletion failed');
            },
          };
        },
      };
    });
    await expect(deleteAnimationCatalogEntry(entry.packId)).rejects.toThrow(
      'Preference deletion failed'
    );
    expect(await getAnimationCatalogEntry(entry.packId)).toEqual(entry);
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toEqual(preference);
    await deleteAnimationCatalogEntry(entry.packId);
    expect(await getAnimationCatalogEntry(entry.packId)).toBeNull();
    expect(await db.get(preferenceStore, ['animation', entry.packId])).toBeUndefined();
  });
  it.each([true, false])(
    'rebinds only compatible references and retains incompatible preferences (%s)',
    async (compatible) => {
      const raw = await artifact();
      const input = await importAnimationArtifactBytes(
        new TextEncoder().encode(
          JSON.stringify({
            ...raw.documents[0]!.template,
            controls: [
              {
                id: 'opacity',
                kind: 'number',
                defaultValue: 100,
                min: 0,
                max: 100,
                group: 'appearance',
              },
            ],
          })
        )
      );
      if (!input.ok) throw new Error('Expected valid controlled animation.');
      const { entry } = await saveAnimationArtifact(input, 1),
        document = entry.documents[0]!;
      await mutateVisualCatalogPreference('animation', entry.packId, () => ({
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'animation',
        packId: entry.packId,
        documents: {
          [document.id]: {
            sourceSha256: document.sha256,
            enabled: false,
            presetPreferences: { presets: [{ id: 'mine', name: 'Mine', values: { opacity: 42 } }] },
          },
        },
      }));
      const before = await db.get(preferenceStore, ['animation', entry.packId]);
      const next = await importAnimationArtifactBytes(
        new TextEncoder().encode(
          JSON.stringify({
            ...input.documents[0]!.template,
            label: { en: 'Updated label' },
            ...(compatible
              ? {}
              : {
                  controls: [
                    { id: 'opacity', kind: 'color', defaultValue: '#ffffff', group: 'appearance' },
                  ],
                }),
          })
        )
      );
      if (!next.ok) throw new Error('Expected valid updated animation.');
      const saved = await saveAnimationArtifact(next, 2);
      const current = await db.get(preferenceStore, ['animation', entry.packId]);
      expect(saved.entry.packId).toBe(entry.packId);
      expect(saved.entry.createdAt).toBe(1);
      expect(saved.unavailablePreferences).toEqual(compatible ? [] : [document.id]);
      expect(current).toEqual({
        ...before,
        documents: {
          [document.id]: {
            ...before.documents[document.id],
            sourceSha256: compatible ? saved.entry.documents[0]!.sha256 : document.sha256,
          },
        },
      });
      expect(Object.hasOwn(saved.entry, 'enabled')).toBe(false);
      expect(Object.hasOwn(saved.entry.documents[0]!, 'presetPreferences')).toBe(false);
    }
  );
  it('leaves the prior row intact on transaction abort and retries with fresh authority', async () => {
    const input = await artifact();
    const first = await saveAnimationArtifact(input, 1);
    mocks.transaction.mockImplementationOnce(() => {
      const tx = db.transaction(animationStore, 'readwrite');
      tx.abort();
      void tx.done.catch(() => undefined);
      return tx;
    });
    await expect(saveAnimationArtifact(input, 2)).rejects.toThrow();
    expect(await getAnimationCatalogEntry(first.entry.packId)).toEqual(first.entry);
    const retried = await saveAnimationArtifact(input, 3);
    expect(retried.entry).toMatchObject({ createdAt: 1, updatedAt: 3 });
  });
  it('keeps the complete file command ahead of deletion while its first read is delayed', async () => {
    const input = await artifact();
    const bytes = new TextEncoder().encode(JSON.stringify(input.documents[0]!.template));
    const file = new File([bytes], 'delayed.json');
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
      started();
      await held;
      return bytes.slice().buffer;
    });
    const pending = importAnimationFiles([file]);
    await entered;
    const packId = `animation.${input.documents[0]!.template.id}`;
    const deletion = deleteAnimationCatalogEntry(packId);
    release();
    expect(await pending).toEqual([
      { filename: 'delayed.json', status: 'imported', packId, unavailablePreferences: [] },
    ]);
    await deletion;
    expect(await getAnimationCatalogEntry(packId)).toBeNull();
  });
  it('refuses an expired workflow permit instead of publishing through a new authority', async () => {
    const input = await artifact();
    let expired: PersistenceMutationPermit | undefined;
    await runWithPersistenceDomainMutationLock('animation-catalog', (permit) => {
      expired = permit;
    });
    if (!expired) throw new Error('Missing test permit');
    await expect(saveAnimationArtifact(input, 1, expired)).rejects.toThrow('no longer active');
    expect(await listAnimationCatalogEntries()).toEqual([]);
  });
  it('does not publish when cancellation occurs during package verification', async () => {
    const input = await artifact();
    const controller = new AbortController();
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      started();
      await held;
      return original(algorithm, data);
    });
    const pending = saveAnimationArtifact(input, 1, undefined, controller.signal);
    await entered;
    controller.abort();
    release();
    await expect(pending).rejects.toThrow();
    expect(await listAnimationCatalogEntries()).toEqual([]);
  });
  it('retains already committed files when a sibling fails import', async () => {
    const input = await artifact();
    const good = new File([JSON.stringify(input.documents[0]!.template)], 'good.json');
    const bad = new File(['{}'], 'bad.json');
    const result = await importAnimationFiles([good, bad]);
    expect(result.map((item) => item.status)).toEqual(['imported', 'failed']);
    expect(await listAnimationCatalogEntries()).toHaveLength(1);
  });
});

describe('DB55 visual preference production commands', () => {
  let db: IDBPDatabase;
  let databaseName = '';
  let serial = 0;
  const store = 'video_visual_preferences';
  const row = (packId: string, enabled = true) => ({
    format: 'sniptale-visual-preferences' as const,
    version: 1 as const,
    kind: 'animation' as const,
    packId,
    enabled,
    documents: {},
  });
  beforeEach(async () => {
    databaseName = `visual-preference-command-${++serial}`;
    db = await openDB(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore(store, { keyPath: ['kind', 'packId'] });
      },
    });
    mocks.db.get.mockImplementation((name, key) => db.get(name, key));
    mocks.db.getAll.mockImplementation((name) => db.getAll(name));
    mocks.transaction.mockImplementation((name, mode) => {
      if (typeof name !== 'string' || (mode !== 'readonly' && mode !== 'readwrite'))
        throw new Error('Invalid fixture transaction');
      return db.transaction(name, mode);
    });
  });
  afterEach(async () => {
    db.close();
    await deleteDB(databaseName);
    installPersistenceLockManagerForTests(null);
    vi.restoreAllMocks();
  });
  it('serializes parallel updates without dropping unrelated or same-package changes', async () => {
    await Promise.all([
      mutateVisualCatalogPreference('animation', 'one', () => row('one')),
      mutateVisualCatalogPreference('animation', 'two', () => row('two')),
      mutateVisualCatalogPreference('animation', 'one', (current) => ({
        ...current!,
        enabled: false,
      })),
    ]);
    expect(await readVisualCatalogPreferences()).toEqual([row('one', false), row('two')]);
  });
  it('rejects changed identities and invalid complete sets before changing existing data', async () => {
    await mutateVisualCatalogPreference('animation', 'one', () => row('one'));
    await expect(
      mutateVisualCatalogPreference('animation', 'one', () => row('two'))
    ).rejects.toThrow('identity changed');
    await runWithPersistenceDomainMutationLock('animation-catalog', async (permit) => {
      await expect(
        replaceVisualCatalogPreferences([row('two'), row('two')], permit)
      ).rejects.toThrow('Invalid');
    });
    expect(await readVisualCatalogPreferences()).toEqual([row('one')]);
  });
  it('replaces a complete admitted set and rejects a permit after its workflow ends', async () => {
    await mutateVisualCatalogPreference('animation', 'one', () => row('one'));
    let expired: PersistenceMutationPermit | undefined;
    await runWithPersistenceDomainMutationLock('animation-catalog', async (permit) => {
      expired = permit;
      await replaceVisualCatalogPreferences([row('two')], permit);
    });
    expect(await readVisualCatalogPreferences()).toEqual([row('two')]);
    if (!expired) throw new Error('Missing fixture permit');
    await expect(replaceVisualCatalogPreferences([], expired)).rejects.toThrow('no longer active');
    expect(await readVisualCatalogPreferences()).toEqual([row('two')]);
  });
  it(
    'rolls back a completed deletion when the following production ' +
      'restore write fails and permits retry',
    async () => {
      await mutateVisualCatalogPreference('animation', 'one', () => row('one'));
      mocks.transaction.mockImplementationOnce(() => {
        const tx = db.transaction(store, 'readwrite');
        return {
          done: tx.done,
          abort: () => tx.abort(),
          store: {
            getAll: () => tx.store.getAll(),
            delete: (key: IDBValidKey) => tx.store.delete(key),
            put: async (value: unknown) => {
              await tx.store.put(value);
              throw new Error('Controlled write refusal');
            },
          },
        };
      });
      await runWithPersistenceDomainMutationLock('animation-catalog', async (permit) => {
        await expect(replaceVisualCatalogPreferences([row('two')], permit)).rejects.toThrow(
          'Controlled write refusal'
        );
      });
      expect(await readVisualCatalogPreferences()).toEqual([row('one')]);
      await runWithPersistenceDomainMutationLock('animation-catalog', (permit) =>
        replaceVisualCatalogPreferences([row('two')], permit)
      );
      expect(await readVisualCatalogPreferences()).toEqual([row('two')]);
    }
  );
});
