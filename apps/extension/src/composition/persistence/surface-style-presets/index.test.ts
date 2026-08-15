import { beforeEach, expect, it, vi } from 'vitest';
import { createSolidPaint } from '@sniptale/foundation/paint';

const mocks = vi.hoisted(() => ({
  canObserve: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: mocks.canObserve,
    subscribeToChanges: mocks.subscribe,
    sync: { get: mocks.get, set: mocks.set },
  },
}));

import {
  addSurfaceStylePreset,
  deleteSurfaceStylePreset,
  duplicateSurfaceStylePreset,
  loadSurfaceStylePresetCatalog,
  renameSurfaceStylePreset,
  reorderSurfaceStylePresets,
  resetSurfaceStylePresetCatalog,
  subscribeToSurfaceStylePresetCatalog,
  toggleSurfaceStylePresetFavorite,
  updateSurfaceStylePreset,
} from '.';

beforeEach(() => {
  mocks.canObserve.mockReset().mockReturnValue(true);
  mocks.get.mockReset().mockResolvedValue({});
  mocks.set.mockReset().mockResolvedValue(undefined);
  mocks.subscribe.mockReset().mockReturnValue(() => undefined);
});

it('requires expectedRevision and re-reads under the mutation owner', async () => {
  const catalog = await loadSurfaceStylePresetCatalog();
  const preset = {
    id: 'u',
    name: 'User',
    origin: 'user' as const,
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
  };
  await expect(addSurfaceStylePreset(catalog.catalogRevision + 1, preset)).resolves.toEqual(
    expect.objectContaining({ outcome: 'stale-revision' })
  );
  await expect(addSurfaceStylePreset(catalog.catalogRevision, preset)).resolves.toEqual(
    expect.objectContaining({ outcome: 'applied' })
  );
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(mocks.set).toHaveBeenCalledOnce();
});

it('blocks unsafe storage until explicit reset recovery', async () => {
  mocks.get.mockResolvedValue({ sniptale_surface_style_presets: { schemaVersion: 99 } });
  await expect(
    addSurfaceStylePreset(0, {
      id: 'u',
      name: 'User',
      origin: 'user',
      style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
    })
  ).resolves.toEqual(expect.objectContaining({ outcome: 'unsafe-storage' }));
  await expect(resetSurfaceStylePresetCatalog(0)).resolves.toEqual(
    expect.objectContaining({ outcome: 'applied' })
  );
});

it('serializes concurrent expected revisions without blind overwrite', async () => {
  let stored: unknown;
  mocks.get.mockImplementation(async () => ({ sniptale_surface_style_presets: stored }));
  mocks.set.mockImplementation(async (value) => {
    stored = value.sniptale_surface_style_presets;
  });
  const make = (id: string) => ({
    id,
    name: id,
    origin: 'user' as const,
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
  });
  const first = addSurfaceStylePreset(0, make('one'));
  const second = addSurfaceStylePreset(0, make('two'));
  await expect(first).resolves.toEqual(expect.objectContaining({ outcome: 'applied' }));
  await expect(second).resolves.toEqual(expect.objectContaining({ outcome: 'stale-revision' }));
  expect((stored as { catalogRevision: number }).catalogRevision).toBe(1);
});

it('returns typed quota and write failure outcomes', async () => {
  const shadow = `box-shadow: ${'0 0 0 #000000, '.repeat(250)}0 0 0 #000000;`;
  const stored = {
    schemaVersion: 1,
    catalogRevision: 4,
    systemCatalogRevision: 1,
    userPresets: [
      {
        id: 'large-one',
        name: 'Large one',
        origin: 'user',
        order: 0,
        style: { fillPaint: createSolidPaint('#fff'), surfaceCss: shadow },
      },
    ],
    favoriteIdsBySurface: {},
  };
  mocks.get.mockResolvedValue({ sniptale_surface_style_presets: stored });
  const second = {
    id: 'large-two',
    name: 'Large two',
    origin: 'user' as const,
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: shadow },
  };
  await expect(addSurfaceStylePreset(4, second)).resolves.toEqual(
    expect.objectContaining({ outcome: 'quota' })
  );
  mocks.get.mockResolvedValue({});
  mocks.set.mockRejectedValueOnce(new Error('sync failed'));
  await expect(
    addSurfaceStylePreset(0, { ...second, style: { ...second.style, surfaceCss: '' } })
  ).resolves.toEqual(expect.objectContaining({ outcome: 'write-failed' }));
});

it('publishes only current sync revisions and exposes an unsubscribe handle', async () => {
  let publish!: (changes: Record<string, { newValue?: unknown }>, area: string) => void;
  const unsubscribe = vi.fn();
  mocks.subscribe.mockImplementation((listener) => {
    publish = listener;
    return unsubscribe;
  });
  await loadSurfaceStylePresetCatalog();
  const listener = vi.fn();
  expect(subscribeToSurfaceStylePresetCatalog(listener)).toBe(unsubscribe);
  publish({ unrelated: { newValue: {} } }, 'sync');
  publish({ sniptale_surface_style_presets: { newValue: { catalogRevision: 2 } } }, 'local');
  publish(
    {
      sniptale_surface_style_presets: {
        newValue: {
          schemaVersion: 1,
          catalogRevision: 2,
          systemCatalogRevision: 1,
          userPresets: [],
          favoriteIdsBySurface: {},
        },
      },
    },
    'sync'
  );
  publish(
    {
      sniptale_surface_style_presets: {
        newValue: {
          schemaVersion: 1,
          catalogRevision: 1,
          systemCatalogRevision: 1,
          userPresets: [],
          favoriteIdsBySurface: {},
        },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0]![0].catalogRevision).toBe(2);
});

it('uses a no-op subscription when sync changes cannot be observed', () => {
  mocks.canObserve.mockReturnValue(false);
  expect(subscribeToSurfaceStylePresetCatalog(vi.fn())).toBeTypeOf('function');
  expect(mocks.subscribe).not.toHaveBeenCalled();
});

it('routes the complete command family through revisioned mutations', async () => {
  let stored: unknown;
  mocks.get.mockImplementation(async () => ({ sniptale_surface_style_presets: stored }));
  mocks.set.mockImplementation(async (value) => {
    stored = value.sniptale_surface_style_presets;
  });
  const style = { fillPaint: createSolidPaint('#fff'), surfaceCss: '' };
  await expect(
    addSurfaceStylePreset(0, { id: 'one', name: 'One', origin: 'user', style })
  ).resolves.toMatchObject({ outcome: 'applied' });
  await expect(
    updateSurfaceStylePreset(1, 'one', { ...style, surfaceCss: 'color: red;' })
  ).resolves.toMatchObject({ outcome: 'applied' });
  await expect(renameSurfaceStylePreset(2, 'one', 'Renamed')).resolves.toMatchObject({
    outcome: 'applied',
  });
  await expect(
    duplicateSurfaceStylePreset(3, 'one', {
      id: 'two',
      name: 'Two',
      origin: 'user',
      style,
    })
  ).resolves.toMatchObject({ outcome: 'applied' });
  await expect(toggleSurfaceStylePresetFavorite(4, 'two')).resolves.toMatchObject({
    outcome: 'applied',
  });
  const beforeReorder = await loadSurfaceStylePresetCatalog();
  const systemIds = beforeReorder.presets
    .filter((preset) => preset.origin === 'system')
    .map((preset) => preset.id);
  await expect(reorderSurfaceStylePresets(5, ['two', ...systemIds, 'one'])).resolves.toMatchObject({
    outcome: 'applied',
  });
  await expect(deleteSurfaceStylePreset(6, 'two')).resolves.toMatchObject({ outcome: 'applied' });
  await expect(reorderSurfaceStylePresets(7, [...systemIds, 'one'])).resolves.toMatchObject({
    outcome: 'unchanged',
  });
  await expect(deleteSurfaceStylePreset(7, 'missing')).resolves.toMatchObject({
    outcome: 'rejected',
  });
  await expect(
    duplicateSurfaceStylePreset(7, 'missing', { id: 'three', name: 'Three', origin: 'user', style })
  ).resolves.toMatchObject({ outcome: 'rejected' });
});
