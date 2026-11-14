import { importEffectFiles } from './import-files';
import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { createHash } from 'node:crypto';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  runWithPersistenceDomainMutationLock,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  createGlTransitionSelection,
  GL_TRANSITION_PRESET_MAX_BYTES,
} from '../../../features/video/project/transition/gl-catalog';
import { readVisualCatalogPreferences } from './preferences';
import {
  saveGlPresetCatalogSource,
  listGlPresetCatalogEntries,
  getGlPresetCatalogEntry,
  deleteGlPresetCatalogEntry,
  setGlPresetCatalogEnabled,
  parseGlPresetCatalogEntry,
  resolveGlPresetCatalogEntry,
  importGlPresetCatalogFile,
  setBuiltinGlTransitionEnabled,
  listBuiltinGlTransitionAvailability,
  GL_PRESET_CATALOG_MAX_ENTRIES,
} from './gl-presets';
const records = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  failDelete: false,
  abortWrite: false,
}));
const store = 'video_gl_transition_presets',
  preferencesStore = 'video_visual_preferences',
  legacyStore = 'video_effect_bundles';
vi.mock('../infrastructure/indexed-db/core', () => ({
  VIDEO_GL_TRANSITION_PRESETS_STORE: 'video_gl_transition_presets',
  VIDEO_VISUAL_PREFERENCES_STORE: 'video_visual_preferences',
  initDB: async () => {
    const db = records.db;
    if (!db) throw new Error('Fixture database is unavailable');
    return {
      get: (table: string, key: IDBValidKey) => db.get(table, key),
      getAll: (table: string) => db.getAll(table),
      transaction: (tables: string | string[], mode: 'readwrite') => {
        const tx = db.transaction(tables, mode);
        if (records.abortWrite) {
          records.abortWrite = false;
          tx.abort();
          void tx.done.catch(() => undefined);
        }
        if (!records.failDelete) return tx;
        return {
          done: tx.done,
          abort: () => tx.abort(),
          objectStore: (table: string) => {
            if (table === 'video_gl_transition_presets') return tx.objectStore(table);
            if (table !== 'video_visual_preferences') throw new Error('Unexpected fixture store');
            return {
              delete: async () => {
                tx.abort();
                await tx.done.catch(() => undefined);
                throw new Error('Preference deletion failed');
              },
            };
          },
        };
      },
    };
  },
}));
let name = '',
  serial = 0;
const opaque = { packId: 'opaque-gl-command', value: [0, 255] };
beforeEach(async () => {
  name = `gl-preset-command-${++serial}`;
  records.db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore(store, { keyPath: 'id' });
      db.createObjectStore(preferencesStore, { keyPath: ['kind', 'packId'] });
      db.createObjectStore(legacyStore, { keyPath: 'packId' });
    },
  });
  await records.db.put(legacyStore, opaque);
  records.failDelete = false;
  records.abortWrite = false;
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
  expect(await records.db!.getAll(legacyStore)).toEqual([opaque]);
  records.db!.close();
  records.db = null;
  await deleteDB(name);
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function source(name = 'Mine', version = '3.2.0') {
  const transition = createGlTransitionSelection('Fade');
  if (!transition) throw new Error('Missing shipped Fade transition');
  return JSON.stringify({
    format: 'sniptale-gl-preset',
    version: 1,
    name,
    transition: { ...transition, version },
  });
}
const hash = (source: string) => createHash('sha256').update(source).digest('hex');
it('stores exact sources, deduplicates reimport and keeps availability outside the immutable record', async () => {
  const text = source(),
    first = await saveGlPresetCatalogSource(text, 1),
    again = await saveGlPresetCatalogSource(text, 2);
  expect(first.id).toBe(`gl.${hash(text)}`);
  expect(first.source).toBe(text);
  expect(again).toEqual({ ...first, updatedAt: 2 });
  expect(await listGlPresetCatalogEntries()).toEqual([again]);
  expect(Object.hasOwn(again, 'enabled')).toBe(false);
  await setGlPresetCatalogEnabled(first.id, false);
  expect(resolveGlPresetCatalogEntry(again, await readVisualCatalogPreferences())).toMatchObject({
    status: 'ready',
    enabled: false,
    name: 'Mine',
  });
  expect(await getGlPresetCatalogEntry(first.id)).toEqual(again);
});
it('retains unsupported pinned implementations as data without an executable selection', async () => {
  const text = source('Future', '99.0.0'),
    entry = await saveGlPresetCatalogSource(text, 1);
  const view = resolveGlPresetCatalogEntry(entry, []);
  expect(view).toMatchObject({ status: 'unsupported', name: 'Future', transitionName: 'Fade' });
  expect(Object.hasOwn(view, 'selection')).toBe(false);
  expect((await getGlPresetCatalogEntry(entry.id))?.source).toBe(text);
});
it.each(['shader', 'url', 'malformed', 'unknown-field'])(
  'refuses unsafe or malformed preset data (%s)',
  async (kind) => {
    const value = JSON.parse(source());
    if (kind === 'shader') value.shader = 'fn main() {}';
    if (kind === 'url') value.transition.url = 'https://example.com/shader.wgsl';
    if (kind === 'malformed') value.transition.wgslSha256 = 'invalid';
    if (kind === 'unknown-field') value.transition.values.unrecognized = 1;
    await expect(saveGlPresetCatalogSource(JSON.stringify(value))).rejects.toMatchObject({
      code: 'catalogEntryInvalid',
    });
    expect(await listGlPresetCatalogEntries()).toEqual([]);
  }
);
it('refuses source, identity, byte accounting and preference-field tampering', async () => {
  const entry = await saveGlPresetCatalogSource(source(), 1);
  for (const changed of [
    { ...entry, id: `gl.${'f'.repeat(64)}` },
    { ...entry, source: entry.source + '\n' },
    { ...entry, sourceSha256: '0'.repeat(64) },
    { ...entry, retainedByteLength: entry.retainedByteLength + 1 },
    { ...entry, enabled: false },
  ])
    expect(parseGlPresetCatalogEntry(changed)).toBeNull();
});
it(
  'serializes parallel imports and independent builtin availability ' +
    'edits without changing project selections',
  async () => {
    await Promise.all([
      saveGlPresetCatalogSource(source('One')),
      saveGlPresetCatalogSource(source('Two')),
    ]);
    expect(await listGlPresetCatalogEntries()).toHaveLength(2);
    const selected = createGlTransitionSelection('Fade'),
      before = structuredClone(selected);
    await Promise.all([
      setBuiltinGlTransitionEnabled('Fade', false),
      setBuiltinGlTransitionEnabled('CrossZoom', false),
    ]);
    const list = await listBuiltinGlTransitionAvailability();
    expect(list).toHaveLength(214);
    expect(list.find((item) => item.transition.name === 'Fade')?.enabled).toBe(false);
    expect(list.find((item) => item.transition.name === 'CrossZoom')?.enabled).toBe(false);
    expect(list.filter((item) => !item.enabled)).toHaveLength(2);
    expect(selected).toEqual(before);
    await expect(setBuiltinGlTransitionEnabled('missing', false)).rejects.toMatchObject({
      code: 'catalogEntryInvalid',
    });
  }
);
it.each(['GL-only', 'ordinary'] as const)(
  'holds a complete delayed %s file import ahead of deletion so it cannot republish after deletion',
  async (entryPoint) => {
    const text = source(),
      bytes = new TextEncoder().encode(text),
      file = new File([bytes], 'delayed.json');
    const entered = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>();
    vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
      entered.resolve();
      await released.promise;
      return bytes.slice().buffer;
    });
    const pending =
      entryPoint === 'ordinary' ? importEffectFiles([file]) : importGlPresetCatalogFile(file);
    await entered.promise;
    const id = `gl.${hash(text)}`,
      deletion = deleteGlPresetCatalogEntry(id);
    released.resolve();
    await pending;
    await deletion;
    expect(await getGlPresetCatalogEntry(id)).toBeNull();
  }
);
it(
  'rolls back partial deletion, retries, and does not restore deleted ' +
    'preferences after same-source recreation',
  async () => {
    const entry = await saveGlPresetCatalogSource(source(), 1);
    await setGlPresetCatalogEnabled(entry.id, false);
    const preference = await readVisualCatalogPreferences();
    records.failDelete = true;
    await expect(deleteGlPresetCatalogEntry(entry.id)).rejects.toThrow(
      'Preference deletion failed'
    );
    expect(await getGlPresetCatalogEntry(entry.id)).toEqual(entry);
    expect(await readVisualCatalogPreferences()).toEqual(preference);
    records.failDelete = false;
    await deleteGlPresetCatalogEntry(entry.id);
    const recreated = await saveGlPresetCatalogSource(source(), 2);
    expect(recreated.createdAt).toBe(2);
    expect(await readVisualCatalogPreferences()).toEqual([]);
    expect(resolveGlPresetCatalogEntry(recreated, []).enabled).toBe(true);
  }
);
it('refuses expired authority and retries a native write failure without discarding committed siblings', async () => {
  const first = await saveGlPresetCatalogSource(source('First'), 1);
  let expired: PersistenceMutationPermit | undefined;
  await runWithPersistenceDomainMutationLock('animation-catalog', (permit) => {
    expired = permit;
  });
  if (!expired) throw new Error('Missing test permit');
  await expect(saveGlPresetCatalogSource(source('Expired'), 2, expired)).rejects.toThrow(
    'no longer active'
  );
  records.abortWrite = true;
  await expect(saveGlPresetCatalogSource(source('Second'), 2)).rejects.toThrow();
  expect(await listGlPresetCatalogEntries()).toEqual([first]);
  await saveGlPresetCatalogSource(source('Second'), 3);
  expect(await listGlPresetCatalogEntries()).toHaveLength(2);
});
it('cancels during file read before publication and permits a fresh retry', async () => {
  const bytes = new TextEncoder().encode(source()),
    file = new File([bytes], 'cancel.json'),
    controller = new AbortController();
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>();
  vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
    entered.resolve();
    await released.promise;
    return bytes.slice().buffer;
  });
  const pending = importGlPresetCatalogFile(file, controller.signal);
  await entered.promise;
  controller.abort();
  released.resolve();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(await listGlPresetCatalogEntries()).toEqual([]);
  await importGlPresetCatalogFile(file);
  expect(await listGlPresetCatalogEntries()).toHaveLength(1);
});
it('bounds file and catalogue admission and retains storage headroom', async () => {
  const file = new File(['x'.repeat(GL_TRANSITION_PRESET_MAX_BYTES + 1)], 'large.json'),
    read = vi.spyOn(file, 'arrayBuffer');
  await expect(importGlPresetCatalogFile(file)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  await expect(
    saveGlPresetCatalogSource('x'.repeat(GL_TRANSITION_PRESET_MAX_BYTES + 1))
  ).rejects.toThrow();
  vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1, usage: 0 }) } });
  await expect(saveGlPresetCatalogSource(source())).rejects.toMatchObject({
    code: 'catalogQuotaExceeded',
  });
  vi.unstubAllGlobals();
  const tx = records.db!.transaction(store, 'readwrite');
  for (let i = 0; i < GL_PRESET_CATALOG_MAX_ENTRIES; i++) {
    const text = source(`Item ${i}`),
      sha256 = hash(text);
    await tx.store.put({
      format: 'sniptale-gl-preset-catalog',
      version: 1,
      id: `gl.${sha256}`,
      source: text,
      sourceSha256: sha256,
      retainedByteLength: Buffer.byteLength(text),
      createdAt: 1,
      updatedAt: 1,
    });
  }
  await tx.done;
  await expect(saveGlPresetCatalogSource(source('Overflow'))).rejects.toMatchObject({
    code: 'catalogQuotaExceeded',
  });
  expect(await listGlPresetCatalogEntries()).toHaveLength(GL_PRESET_CATALOG_MAX_ENTRIES);
  await saveGlPresetCatalogSource(source('Item 0'), 2);
  expect(await listGlPresetCatalogEntries()).toHaveLength(GL_PRESET_CATALOG_MAX_ENTRIES);
});

it(
  'imports ordinary GL files with real source verification, retains ' +
    'future implementations and refuses embedded shaders',
  async () => {
    const accepted = source('Installed'),
      future = source('Future', '99.0.0');
    const invalid = JSON.stringify({ ...JSON.parse(accepted), shader: 'untrusted source' });
    const files = [
      new File([accepted], 'installed.json'),
      new File([invalid], 'refused.json'),
      new File([future], 'future.json'),
    ];
    expect(await importEffectFiles(files)).toEqual(
      files.map((file, index) => ({
        filename: file.name,
        status: index === 1 ? 'failed' : 'imported',
      }))
    );
    const entries = await listGlPresetCatalogEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.source).sort()).toEqual([accepted, future].sort());
    expect(
      resolveGlPresetCatalogEntry(
        entries.find((entry) => entry.source === future)!,
        []
      )
    ).toMatchObject({ status: 'unsupported' });
  }
);
