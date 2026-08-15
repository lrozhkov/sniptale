import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ observable: false, value: undefined as unknown }));
const { subscribeMock, syncGetMock, syncSetMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn<
    (
      listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void
    ) => () => void
  >(() => () => undefined),
  syncGetMock: vi.fn(async () => ({ sniptale_gradient_presets: storage.value })),
  syncSetMock: vi.fn(async (payload: Record<string, unknown>) => {
    storage.value = payload['sniptale_gradient_presets'];
  }),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: () => storage.observable,
    subscribeToChanges: subscribeMock,
    sync: { get: syncGetMock, set: syncSetMock },
  },
}));

import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
import { cloneGradientPresetCatalog, createDefaultGradientPresetCatalog } from './defaults';
import {
  addUserGradientPreset,
  deleteUserGradientPreset,
  reorderGradientPresets,
  resetSystemGradientPreset,
  setDefaultGradientPreset,
  toggleGradientPresetEnabled,
  toggleGradientPresetFavorite,
  updateGradientPresetValues,
} from './mutations';
import { parseGradientPresetCatalog } from './parser';

beforeEach(() => {
  installPersistenceLockManagerForTests(null);
  storage.value = undefined;
  storage.observable = false;
  vi.clearAllMocks();
});

describe('gradient preset catalog model', () => {
  it('supports complete system and user management with default invariants', () => {
    const base = createDefaultGradientPresetCatalog();
    const gradient = structuredClone(base.presets[0]!.gradient);
    const first = addUserGradientPreset(base, {
      id: 'user-1',
      name: ' Mine ',
      order: 0,
      origin: 'user',
      gradient,
    })!;
    const second = addUserGradientPreset(first, {
      id: 'user-2',
      name: 'Copy',
      order: 0,
      origin: 'user',
      gradient,
    })!;
    expect(first.presets.find((preset) => preset.id === 'user-1')?.name).toBe('Mine');
    const editedSystem = updateGradientPresetValues(
      second,
      base.presets[0]!.id,
      gradient,
      'Edited system'
    )!;
    expect(editedSystem.presets[0]).toMatchObject({ customized: true, name: 'Edited system' });
    const renamed = updateGradientPresetValues(editedSystem, 'user-1', gradient, 'Renamed')!;
    expect(renamed.presets.find((preset) => preset.id === 'user-1')?.name).toBe('Renamed');
    expect(updateGradientPresetValues(second, 'user-1', gradient, 'x'.repeat(81))).toBeNull();
    const ids = renamed.presets.map((preset) => preset.id);
    const reordered = reorderGradientPresets(renamed, [
      'user-2',
      ...ids.filter((id) => id !== 'user-2' && id !== 'user-1'),
      'user-1',
    ])!;
    expect(
      reordered.presets.filter((preset) => preset.origin === 'user').map((preset) => preset.id)
    ).toEqual(['user-2', 'user-1']);
    const favorite = toggleGradientPresetFavorite(reordered, 'highlighter-frame-fill', 'user-1')!;
    expect(favorite.favoriteIdsBySurface['highlighter-frame-fill']).toEqual(['user-1']);
    expect(
      deleteUserGradientPreset(favorite, 'user-1')?.favoriteIdsBySurface['highlighter-frame-fill']
    ).toEqual([]);
    const systemId = base.presets[1]!.id;
    const disabled = toggleGradientPresetEnabled(reordered, systemId)!;
    expect(disabled.presets.find((preset) => preset.id === systemId)).toMatchObject({
      customized: true,
      enabled: false,
    });
    expect(setDefaultGradientPreset(disabled, 'highlighter-frame-fill', systemId)).toBeNull();
    expect(toggleGradientPresetEnabled(base, base.presets[0]!.id)).toBeNull();
    const reset = resetSystemGradientPreset(editedSystem, base.presets[0]!.id)!;
    expect(reset.presets.find((preset) => preset.id === base.presets[0]!.id)).toEqual(
      base.presets[0]
    );
  });

  it('rejects system collisions, duplicate users, malformed data, and newer revisions', () => {
    const base = createDefaultGradientPresetCatalog();
    const system = base.presets[0]!;
    expect(addUserGradientPreset(base, { ...system, origin: 'user' })).toBeNull();
    expect(parseGradientPresetCatalog({ revision: 99, presets: [] }).unsafeForWrite).toBe(true);
    expect(parseGradientPresetCatalog({ revision: -1, presets: [] }).unsafeForWrite).toBe(true);
    expect(parseGradientPresetCatalog({ revision: 0 }).unsafeForWrite).toBe(true);
    expect(
      parseGradientPresetCatalog({ revision: 1, presets: [], favoriteIdsBySurface: [] })
        .unsafeForWrite
    ).toBe(true);
    expect(parseGradientPresetCatalog({ revision: 1, presets: [{ id: 'x' }] }).unsafeForWrite).toBe(
      true
    );
    expect(
      parseGradientPresetCatalog({
        revision: 1,
        presets: [
          { ...system, id: 'duplicate', origin: 'user' },
          { ...system, id: 'duplicate', origin: 'user' },
        ],
      }).unsafeForWrite
    ).toBe(true);
  });

  it('stores only the parsed canonical gradient when mutation input contains CSS control text', () => {
    const base = createDefaultGradientPresetCatalog();
    const gradient = structuredClone(base.presets[0]!.gradient);
    gradient.stops[0]!.color =
      'rgb(0,0,0));background-image:url(https://attacker.invalid/pixel);/*';
    const next = addUserGradientPreset(base, {
      id: 'user-canonical',
      name: 'Canonical',
      order: 0,
      origin: 'user',
      gradient,
    });
    const color = next?.presets.find((preset) => preset.id === 'user-canonical')?.gradient.stops[0]
      ?.color;
    expect(color === undefined || color === '#000000ff').toBe(true);
    expect(JSON.stringify(next)).not.toContain('attacker.invalid');
  });

  it('migrates an older valid revision and drops stale favorites', () => {
    const system = createDefaultGradientPresetCatalog().presets[0]!;
    const parsed = parseGradientPresetCatalog({
      revision: 0,
      presets: [{ ...system, id: 'user-1', name: 'Old', origin: 'user' }],
      favoriteIdsBySurface: { 'highlighter-frame-fill': ['user-1', 'missing'] },
    });
    expect(parsed.unsafeForWrite).toBe(false);
    expect(parsed.catalog.revision).toBe(2);
    expect(parsed.catalog.favoriteIdsBySurface['highlighter-frame-fill']).toEqual(['user-1']);
  });

  it('clones favorite collections without sharing mutable state', () => {
    const catalog = createDefaultGradientPresetCatalog();
    catalog.favoriteIdsBySurface['highlighter-frame-fill'] = [catalog.presets[0]!.id];
    const clone = cloneGradientPresetCatalog(catalog);
    clone.favoriteIdsBySurface['highlighter-frame-fill']!.push('detached');
    expect(catalog.favoriteIdsBySurface['highlighter-frame-fill']).toHaveLength(1);
    Object.assign(catalog.favoriteIdsBySurface, { 'highlighter-frame-fill': undefined });
    expect(cloneGradientPresetCatalog(catalog).favoriteIdsBySurface).toEqual({
      'highlighter-frame-fill': [],
    });
  });

  it('requires an enabled default and internally consistent v2 customization metadata', () => {
    const base = createDefaultGradientPresetCatalog();
    const { favoriteIdsBySurface: _favorites, ...withoutFavorites } = base;
    expect(parseGradientPresetCatalog(withoutFavorites).unsafeForWrite).toBe(true);
    expect(parseGradientPresetCatalog({ ...base, favoriteIdsBySurface: [] }).unsafeForWrite).toBe(
      true
    );
    expect(
      parseGradientPresetCatalog({ ...base, defaultPresetIdBySurface: {} }).unsafeForWrite
    ).toBe(true);
    expect(
      parseGradientPresetCatalog({
        ...base,
        presets: base.presets.map((preset, index) =>
          index === 1 ? { ...preset, enabled: false, customized: false } : preset
        ),
      }).unsafeForWrite
    ).toBe(true);
  });
});

describe('gradient preset persistence authority', () => {
  it('serializes concurrent mutations and re-reads latest storage before each write', async () => {
    const module = await import('./index');
    const gradient = createDefaultGradientPresetCatalog().presets[0]!.gradient;
    await Promise.all([
      module.addGradientPreset({ id: 'user-1', name: 'One', order: 0, origin: 'user', gradient }),
      module.addGradientPreset({ id: 'user-2', name: 'Two', order: 0, origin: 'user', gradient }),
    ]);
    expect(syncGetMock).toHaveBeenCalledTimes(2);
    expect(syncSetMock).toHaveBeenCalledTimes(2);
    expect(
      (storage.value as ReturnType<typeof createDefaultGradientPresetCatalog>).presets.filter(
        (preset) => preset.origin === 'user'
      )
    ).toHaveLength(2);
  });

  it('rejects stale/newer revisions and surfaces failed writes to callers', async () => {
    const module = await import('./index');
    storage.value = { revision: 99, presets: [] };
    const gradient = createDefaultGradientPresetCatalog().presets[0]!.gradient;
    await expect(
      module.addGradientPreset({ id: 'user-1', name: 'One', order: 0, origin: 'user', gradient })
    ).resolves.toBe('rejected');
    syncSetMock.mockRejectedValueOnce(new Error('quota'));
    storage.value = undefined;
    await expect(
      module.addGradientPreset({ id: 'user-2', name: 'Two', order: 0, origin: 'user', gradient })
    ).rejects.toThrow('quota');
  });

  it('exposes the complete mutation API and storage change subscription', async () => {
    const module = await import('./index');
    const base = createDefaultGradientPresetCatalog();
    const gradient = base.presets[0]!.gradient;
    storage.value = base;
    await expect(module.loadGradientPresetCatalog()).resolves.toEqual(base);
    await expect(
      module.addGradientPreset({
        id: 'user-1',
        name: 'One',
        order: 0,
        origin: 'user',
        gradient,
      })
    ).resolves.toBe('applied');
    await expect(module.renameGradientPreset('user-1', 'Renamed')).resolves.toBe('applied');
    const writesBeforeRejectedRename = syncSetMock.mock.calls.length;
    await expect(module.renameGradientPreset('user-1', 'x'.repeat(81))).resolves.toBe('rejected');
    expect(syncSetMock).toHaveBeenCalledTimes(writesBeforeRejectedRename);
    await expect(module.loadGradientPresetCatalog()).resolves.toEqual(
      expect.objectContaining({
        presets: expect.arrayContaining([
          expect.objectContaining({ id: 'user-1', name: 'Renamed' }),
        ]),
      })
    );
    await expect(
      module.duplicateGradientPreset('user-1', {
        id: 'user-2',
        name: 'Copy',
        order: 0,
        origin: 'user',
        gradient,
      })
    ).resolves.toBe('applied');
    const catalogBeforeReorder = await module.loadGradientPresetCatalog();
    const systemIds = catalogBeforeReorder.presets
      .filter((preset) => preset.origin === 'system')
      .map((preset) => preset.id);
    await expect(
      module.reorderGradientPresetCatalog(['user-2', ...systemIds, 'user-1'])
    ).resolves.toBe('applied');
    await expect(
      module.reorderGradientPresetCatalog(['user-2', ...systemIds, 'user-1'])
    ).resolves.toBe('unchanged');
    await expect(
      module.toggleGradientPresetFavoriteForSurface('highlighter-frame-fill', 'user-1')
    ).resolves.toBe('applied');
    await expect(module.updateGradientPreset('user-1', gradient)).resolves.toBe('unchanged');
    await expect(module.deleteGradientPreset('user-2')).resolves.toBe('applied');
    await expect(module.renameGradientPreset('missing', 'Nope')).resolves.toBe('rejected');
    await expect(
      module.duplicateGradientPreset('missing', {
        id: 'user-3',
        name: 'Nope',
        order: 0,
        origin: 'user',
        gradient,
      })
    ).resolves.toBe('rejected');

    expect(module.subscribeToGradientPresetCatalog(vi.fn())).toEqual(expect.any(Function));
    storage.observable = true;
    const listener = vi.fn();
    module.subscribeToGradientPresetCatalog(listener);
    const storageListener = subscribeMock.mock.calls.at(-1)?.[0];
    storageListener?.(
      { sniptale_gradient_presets: { newValue: createDefaultGradientPresetCatalog() } },
      'sync'
    );
    storageListener?.({ unrelated: { newValue: null } }, 'local');
    expect(listener).toHaveBeenCalledOnce();
  });
});
