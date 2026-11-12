import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import { createGlTransitionSelection } from '../../../features/video/project/transition/gl-catalog';
import type { VisualCatalogPreference } from '../../../features/video/project/effect-bundle/catalog/presets';
import { createAnimationCatalogEntry } from './catalog-builder';
import { assertAnimationCatalogIntegrity } from './integrity';
import {
  parseGlPresetCatalogEntry,
  importGlPresetCatalogFile,
  saveGlPresetCatalogSource,
  resolveGlPresetCatalogEntry,
} from './gl-presets';
import { readVisualCatalogPreferences } from './preferences';
import { getEffectBundle } from './index';
import {
  runWithExclusivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
} from '../infrastructure/mutation-barrier';
import {
  encodeEffectSettingsEntry,
  decodeEffectSettingsEntry,
  encodeGlPresetSettingsEntry,
  decodeGlPresetSettingsEntry,
  prepareEffectSettingsMutation,
} from './settings-transfer';
import { buildSettingsTransferPackage } from '../../../workflows/settings-transfer/package';
import { buildSettingsTransferTree } from '../../../workflows/settings-transfer/tree';
import { planSettingsTransfer } from '../../../workflows/settings-transfer/planner';
import {
  cloneSettingsTransferJsonValue,
  parseSettingsTransferPackageText,
} from '../../../contracts/settings-transfer';

const state = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  failPreferencePut: false,
  reads: [] as string[],
}));
const animations = 'video_animation_packages',
  gl = 'video_gl_transition_presets',
  preferences = 'video_visual_preferences',
  legacy = 'video_effect_bundles';
vi.mock('../infrastructure/indexed-db/core', () => ({
  VIDEO_ANIMATION_PACKAGES_STORE: 'video_animation_packages',
  VIDEO_GL_TRANSITION_PRESETS_STORE: 'video_gl_transition_presets',
  VIDEO_VISUAL_PREFERENCES_STORE: 'video_visual_preferences',
  VIDEO_EFFECT_BUNDLES_STORE: 'video_effect_bundles',
  initDB: async () => {
    const db = state.db;
    if (!db) throw new Error('Missing fixture database');
    return {
      get: (table: string, key: IDBValidKey) => {
        state.reads.push(table);
        return db.get(table, key);
      },
      getAll: (table: string) => {
        state.reads.push(table);
        return db.getAll(table);
      },
      transaction: (tables: string | string[], mode: 'readwrite') => {
        const tx = db.transaction(tables, mode);
        if (!state.failPreferencePut) return tx;
        return {
          done: tx.done,
          abort: () => tx.abort(),
          objectStore: (table: string) => {
            const store = tx.objectStore(table);
            return {
              getAll: () => store.getAll(),
              delete: (key: IDBValidKey) => store.delete(key),
              put: async (value: unknown) => {
                if (table === 'video_visual_preferences') {
                  tx.abort();
                  await tx.done.catch(() => undefined);
                  throw new Error('Preference write failed');
                }
                return store.put(value);
              },
            };
          },
        };
      },
    };
  },
}));
let serial = 0,
  databaseName = '';
const oldRow = {
  packId: 'animation.sniptale-title',
  source: 'opaque old EffectV1 bytes',
  bytes: [0, 255],
};
beforeEach(async () => {
  databaseName = `visual-settings-${++serial}`;
  state.db = await openDB(databaseName, 1, {
    upgrade(db) {
      db.createObjectStore(animations, { keyPath: 'packId' });
      db.createObjectStore(gl, { keyPath: 'id' });
      db.createObjectStore(preferences, { keyPath: ['kind', 'packId'] });
      db.createObjectStore(legacy, { keyPath: 'packId' });
    },
  });
  state.failPreferencePut = false;
  state.reads = [];
  await state.db.put(legacy, oldRow);
  const queues = new Map<string, Promise<unknown>>();
  installPersistenceLockManagerForTests({
    request(name, _options, operation) {
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
  expect(await state.db!.getAll(legacy)).toEqual([oldRow]);
  state.db!.close();
  state.db = null;
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
});
async function animation(label = 'Animation') {
  const bytes = readFileSync(
    'apps/extension/public/video-effects/animations/title.sniptale-animation.json'
  );
  const original = await importAnimationArtifactBytes(bytes);
  if (!original.ok) throw new Error('Invalid shipped animation');
  const imported = await importAnimationArtifactBytes(
    new TextEncoder().encode(
      JSON.stringify({ ...original.documents[0]!.template, label: { en: label, ru: label } })
    )
  );
  if (!imported.ok) throw new Error('Invalid renamed animation');
  return createAnimationCatalogEntry(imported, 1);
}
function glSource(name = 'Mine', version = '3.2.0') {
  const transition = createGlTransitionSelection('Fade');
  if (!transition) throw new Error('Missing Fade');
  return JSON.stringify({
    format: 'sniptale-gl-preset',
    version: 1,
    name,
    transition: { ...transition, version },
  });
}
function glEntry(source = glSource()) {
  const hash = createHash('sha256').update(source).digest('hex');
  const entry = parseGlPresetCatalogEntry({
    format: 'sniptale-gl-preset-catalog',
    version: 1,
    id: `gl.${hash}`,
    source,
    sourceSha256: hash,
    retainedByteLength: Buffer.byteLength(source),
    createdAt: 1,
    updatedAt: 1,
  });
  if (!entry) throw new Error('Invalid GL fixture');
  return entry;
}
function preference(
  kind: VisualCatalogPreference['kind'],
  packId: string,
  documentId: string,
  sha: string,
  enabled = false
): VisualCatalogPreference {
  return {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind,
    packId,
    documents: { [documentId]: { sourceSha256: sha, enabled } },
  };
}
const domain = (data: unknown) => ({
  'styles.video-effects': { schemaVersion: 1, data: cloneSettingsTransferJsonValue(data) },
});

it(
  'roundtrips exact embedded Lottie and unsupported GL sources through ' +
    'independently selected JSON fields',
  async () => {
    const entry = await animation(),
      portable = await encodeEffectSettingsEntry(entry),
      transition = glEntry(glSource('Future', '99.0.0'));
    const animPreferences = preference(
      'animation',
      entry.packId,
      entry.documents[0]!.id,
      entry.documents[0]!.sha256
    );
    const transitionPreferences = preference(
      'transition',
      transition.id,
      'Fade',
      transition.sourceSha256
    );
    const fields = {
      items: [portable],
      preferences: [animPreferences],
      transitionItems: [encodeGlPresetSettingsEntry(transition)],
      transitionPreferences: [transitionPreferences],
    };
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'styles.video-effects.items', id: portable.id, label: portable.name },
      {
        collectionNodeId: 'styles.video-effects.transitionItems',
        id: transition.id,
        label: 'Future',
      },
    ]);
    for (const field of [
      'items',
      'preferences',
      'transitionItems',
      'transitionPreferences',
    ] as const) {
      const built = buildSettingsTransferPackage({
        appVersion: '1',
        domains: domain(fields),
        tree,
        exportKind: 'selective',
        selectedNodeIds: [`styles.video-effects.${field}`],
      });
      const parsed = parseSettingsTransferPackageText(built.fileText);
      expect(parsed.domains['styles.video-effects']!.data).toEqual({ [field]: fields[field] });
    }
    const full = buildSettingsTransferPackage({
      appVersion: '1',
      domains: domain(fields),
      tree,
      exportKind: 'backup',
      selectedNodeIds: [],
    });
    expect(
      parseSettingsTransferPackageText(full.fileText).domains['styles.video-effects']!.data
    ).toEqual(fields);
    const restored = decodeEffectSettingsEntry(JSON.parse(JSON.stringify(portable)));
    expect(restored).toEqual(entry);
    await expect(assertAnimationCatalogIntegrity(restored)).resolves.toBeUndefined();
    expect(decodeGlPresetSettingsEntry(encodeGlPresetSettingsEntry(transition))).toEqual(
      transition
    );
    expect(resolveGlPresetCatalogEntry(transition, []).status).toBe('unsupported');
  }
);
it(
  'copies conflicting Lottie packs with matching preference identity ' +
    'and leaves project source bytes intact',
  async () => {
    const local = await encodeEffectSettingsEntry(await animation('Local')),
      imported = await encodeEffectSettingsEntry(await animation('Imported'));
    const preserved = preference('animation', 'builtin:base', 'missing', 'f'.repeat(64));
    const incoming = preference(
      'animation',
      imported.id,
      imported.documents[0]!.id,
      imported.documents[0]!.sha256
    );
    const plan = planSettingsTransfer({
      current: domain({ items: [local], preferences: [preserved] }),
      imported: domain({ items: [imported], preferences: [incoming] }),
      strategy: 'safe-merge',
    });
    const data = plan.domains['styles.video-effects']!.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data['items']))
      throw new Error('Missing planned items');
    const entries = data['items'].map(decodeEffectSettingsEntry);
    expect(entries).toHaveLength(2);
    expect(entries[1]!.packId).not.toBe(entries[0]!.packId);
    expect(entries[1]!.documents).toEqual(imported.documents);
    expect(data['preferences']).toContainEqual(preserved);
    expect(data['preferences']).toContainEqual({ ...incoming, packId: entries[1]!.packId });
  }
);
it('deduplicates the same immutable GL source without creating an invalid copy for timestamp-only differences', () => {
  const item = encodeGlPresetSettingsEntry(glEntry());
  const plan = planSettingsTransfer({
    current: domain({ transitionItems: [item] }),
    imported: domain({ transitionItems: [{ ...item, createdAt: 5, updatedAt: 8 }] }),
    strategy: 'safe-merge',
  });
  expect(plan.domains['styles.video-effects']!.data).toEqual({ transitionItems: [item] });
  expect(plan.conflicts).toEqual([]);
});
it('merges each preference inventory by source identity with one explicit conflict decision', () => {
  for (const [field, kind] of [
    ['preferences', 'animation'],
    ['transitionPreferences', 'transition'],
  ] as const) {
    const local = preference(kind, 'missing', 'document', 'a'.repeat(64)),
      imported = { ...local, documents: {} };
    for (const decision of ['keep-local', 'use-imported'] as const) {
      const plan = planSettingsTransfer({
        current: domain({ [field]: [local] }),
        imported: domain({ [field]: [imported] }),
        strategy: 'safe-merge',
        decisions: { [`styles.video-effects.${field}`]: decision },
      });
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.domains['styles.video-effects']!.data).toEqual({
        [field]: [decision === 'keep-local' ? local : imported],
      });
    }
  }
});
it('refuses damaged source/resource bytes and mismatched field kinds before any native write', async () => {
  const entry = await animation(),
    portable = await encodeEffectSettingsEntry(entry),
    transition = encodeGlPresetSettingsEntry(glEntry());
  expect(() => decodeEffectSettingsEntry({ ...portable, enabled: false })).toThrow();
  expect(() =>
    decodeGlPresetSettingsEntry({ ...transition, id: `gl.${'f'.repeat(64)}` })
  ).toThrow();
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    await expect(
      prepareEffectSettingsMutation(
        {
          items: [
            {
              ...portable,
              documents: portable.documents.map((document) => ({
                ...document,
                sha256: '0'.repeat(64),
              })),
            },
          ],
        },
        permit
      )
    ).rejects.toThrow();
    const changed = JSON.parse(portable.documents[0]!.source);
    changed.resources[0].sha256 = '0'.repeat(64);
    const source = JSON.stringify(changed),
      hash = createHash('sha256').update(source).digest('hex');
    await expect(
      prepareEffectSettingsMutation(
        {
          items: [
            {
              ...portable,
              retainedByteLength: Buffer.byteLength(source),
              documents: [{ ...portable.documents[0]!, source, sha256: hash }],
            },
          ],
        },
        permit
      )
    ).rejects.toThrow();
    await expect(
      prepareEffectSettingsMutation(
        { preferences: [preference('transition', 'missing', 'Fade', 'a'.repeat(64))] },
        permit
      )
    ).rejects.toThrow('kind');
  });
  expect(await state.db!.getAll(animations)).toEqual([]);
  expect(await state.db!.getAll(gl)).toEqual([]);
});
it(
  'keeps preference-only missing/foreign references unavailable ' +
    'without reading or writing source stores',
  async () => {
    const entry = await animation(),
      missing = preference('animation', entry.packId, entry.documents[0]!.id, 'f'.repeat(64));
    state.reads = [];
    await runWithExclusivePersistenceMutationPermit(async (permit) => {
      const plan = await prepareEffectSettingsMutation({ preferences: [missing] }, permit);
      await plan.commit();
    });
    expect(state.reads).toEqual([preferences]);
    await runWithExclusivePersistenceMutationPermit(async (permit) => {
      const plan = await prepareEffectSettingsMutation(
        { items: [await encodeEffectSettingsEntry(entry)] },
        permit
      );
      await plan.commit();
    });
    expect(await readVisualCatalogPreferences()).toEqual([missing]);
    const view = await getEffectBundle(entry.packId);
    expect(view?.documents[0]!.enabled).toBe(true);
    expect(await state.db!.get(animations, entry.packId)).toEqual(entry);
  }
);
it('keeps unselected preference kinds and source records unchanged during selective restore', async () => {
  const entry = await animation(),
    transition = glEntry(),
    existing = preference('transition', transition.id, 'Fade', transition.sourceSha256);
  await state.db!.put(animations, entry);
  await state.db!.put(gl, transition);
  await state.db!.put(preferences, existing);
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation({ preferences: [] }, permit);
    await plan.commit();
  });
  expect(await readVisualCatalogPreferences()).toEqual([existing]);
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation({ transitionItems: [] }, permit);
    await plan.commit();
  });
  expect(await state.db!.getAll(gl)).toEqual([]);
  expect(await state.db!.getAll(animations)).toEqual([entry]);
  expect(await readVisualCatalogPreferences()).toEqual([existing]);
});
it('aborts source and preference writes atomically, retries, and compensates to exact before-state', async () => {
  const before = await animation('Before'),
    after = await animation('After'),
    transition = glEntry();
  const oldPreference = preference(
    'animation',
    before.packId,
    before.documents[0]!.id,
    before.documents[0]!.sha256
  );
  const nextPreference = preference(
    'animation',
    after.packId,
    after.documents[0]!.id,
    after.documents[0]!.sha256,
    true
  );
  await state.db!.put(animations, before);
  await state.db!.put(preferences, oldPreference);
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation(
      {
        items: [await encodeEffectSettingsEntry(after)],
        preferences: [nextPreference],
        transitionItems: [encodeGlPresetSettingsEntry(transition)],
      },
      permit
    );
    state.failPreferencePut = true;
    await expect(plan.commit()).rejects.toThrow('Preference write failed');
    expect(await state.db!.getAll(animations)).toEqual([before]);
    expect(await state.db!.getAll(gl)).toEqual([]);
    expect(await readVisualCatalogPreferences()).toEqual([oldPreference]);
    state.failPreferencePut = false;
    await plan.commit();
    expect(await state.db!.getAll(animations)).toEqual([after]);
    expect(await state.db!.getAll(gl)).toEqual([transition]);
    await plan.rollback();
    expect(await state.db!.getAll(animations)).toEqual([before]);
    expect(await state.db!.getAll(gl)).toEqual([]);
    expect(await readVisualCatalogPreferences()).toEqual([oldPreference]);
  });
});
it('requires live workflow authority and refuses an expired prepared mutation', async () => {
  await expect(prepareEffectSettingsMutation({ preferences: [] })).rejects.toThrow('permit');
  const plan = await runWithExclusivePersistenceMutationPermit((permit) =>
    prepareEffectSettingsMutation({ preferences: [] }, permit)
  );
  await expect(plan.commit()).rejects.toThrow('permit');
  expect(await readVisualCatalogPreferences()).toEqual([]);
});
it('orders delayed file publication before exact restore, so the removed source cannot reappear later', async () => {
  const text = glSource(),
    bytes = new TextEncoder().encode(text),
    file = new File([bytes], 'delayed.json');
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>();
  vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
    entered.resolve();
    await released.promise;
    return bytes.slice().buffer;
  });
  const pending = importGlPresetCatalogFile(file);
  await entered.promise;
  const restore = runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation({ transitionItems: [] }, permit);
    await plan.commit();
  });
  released.resolve();
  await pending;
  await restore;
  expect(await state.db!.getAll(gl)).toEqual([]);
});
it('orders a concurrent catalogue writer after the complete exclusive restore', async () => {
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>();
  const restore = runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation({ transitionItems: [] }, permit);
    entered.resolve();
    await released.promise;
    await plan.commit();
  });
  await entered.promise;
  const pending = saveGlPresetCatalogSource(glSource('After restore'));
  expect(await state.db!.getAll(gl)).toEqual([]);
  released.resolve();
  await restore;
  const entry = await pending;
  expect(await state.db!.getAll(gl)).toEqual([entry]);
});
