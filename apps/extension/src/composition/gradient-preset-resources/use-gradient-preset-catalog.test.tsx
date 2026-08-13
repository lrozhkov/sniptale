// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultGradientPresetCatalog } from '../persistence/gradient-presets/defaults';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  enabled: vi.fn(),
  favorite: vi.fn(),
  load: vi.fn(),
  subscribe: vi.fn(),
  default: vi.fn(),
  reorder: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
  locale: 'en',
}));

vi.mock('../persistence/gradient-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/gradient-presets')>()),
  addGradientPreset: mocks.add,
  deleteGradientPreset: mocks.delete,
  loadGradientPresetCatalog: mocks.load,
  reorderGradientPresetCatalog: mocks.reorder,
  resetGradientPreset: mocks.reset,
  setDefaultGradientPresetForSurface: mocks.default,
  subscribeToGradientPresetCatalog: mocks.subscribe,
  toggleGradientPresetFavoriteForSurface: mocks.favorite,
  toggleGradientPresetEnabled: mocks.enabled,
  updateGradientPreset: mocks.update,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => `${mocks.locale}:${key}`,
  useAppLocale: () => mocks.locale,
}));

import { useGradientPresetCatalog } from './use-gradient-preset-catalog';

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  mocks.locale = 'en';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const catalog = createDefaultGradientPresetCatalog();
  mocks.load.mockResolvedValue(catalog);
  mocks.subscribe.mockReturnValue(vi.fn());
  mocks.add.mockResolvedValue('applied');
  mocks.delete.mockResolvedValue('applied');
  mocks.enabled.mockResolvedValue('applied');
  mocks.favorite.mockResolvedValue('applied');
  mocks.default.mockResolvedValue('applied');
  mocks.reorder.mockResolvedValue('applied');
  mocks.reset.mockResolvedValue('applied');
  mocks.update.mockResolvedValue('applied');
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(catalog);
  mocks.subscribe.mockReturnValue(vi.fn());
  mocks.add.mockResolvedValue('applied');
  mocks.delete.mockResolvedValue('applied');
  mocks.enabled.mockResolvedValue('applied');
  mocks.favorite.mockResolvedValue('applied');
  mocks.default.mockResolvedValue('applied');
  mocks.reorder.mockResolvedValue('applied');
  mocks.reset.mockResolvedValue('applied');
  mocks.update.mockResolvedValue('applied');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

it('owns subscription, favorite projection and action adaptation', async () => {
  const catalog = createDefaultGradientPresetCatalog();
  catalog.favoriteIdsBySurface['highlighter-frame-fill'] = [catalog.presets[0]!.id];
  mocks.load.mockResolvedValue(catalog);
  let resources!: ReturnType<typeof useGradientPresetCatalog>;
  function View() {
    resources = useGradientPresetCatalog('highlighter-frame-fill');
    return null;
  }
  await act(async () => {
    root?.render(<View />);
    await Promise.resolve();
  });
  expect(mocks.subscribe).toHaveBeenCalledOnce();
  expect(resources.presets[0]?.favorite).toBe(true);
  expect(resources.presets[0]?.name).toBe('en:highlighter.paintPicker.systemPresets.sunset');
  await act(async () => {
    await resources.actions.onSave('Mine', catalog.presets[0]!.gradient);
  });
  expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mine', origin: 'user' }));
  vi.stubGlobal('crypto', undefined);
  await act(async () => {
    await resources.actions.onSave('Fallback id', catalog.presets[0]!.gradient);
  });
  vi.unstubAllGlobals();
  expect(mocks.add).toHaveBeenCalledWith(
    expect.objectContaining({ id: expect.stringMatching(/^gradient-/), name: 'Fallback id' })
  );
  await act(async () => {
    await resources.actions.onUpdate(catalog.presets[0]!.id, catalog.presets[0]!.gradient);
    await resources.actions.onToggleFavorite(catalog.presets[0]!.id);
    await resources.actions.onDelete(catalog.presets[0]!.id);
    await resources.actions.onEdit('system-sunset', 'Edited', catalog.presets[0]!.gradient);
    await resources.actions.onToggleEnabled(catalog.presets[1]!.id);
    await resources.actions.onSetDefault(catalog.presets[1]!.id);
    await resources.actions.onResetPreset(catalog.presets[1]!.id);
    await resources.actions.onReorder(catalog.presets.map((preset) => preset.id));
  });
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.favorite).toHaveBeenCalledOnce();
  expect(mocks.delete).toHaveBeenCalledOnce();
  expect(mocks.enabled).toHaveBeenCalledWith(catalog.presets[1]!.id);
  expect(mocks.default).toHaveBeenCalledWith('highlighter-frame-fill', catalog.presets[1]!.id);
  expect(mocks.reset).toHaveBeenCalledWith(catalog.presets[1]!.id);
  expect(mocks.reorder).toHaveBeenCalledOnce();
});

it('reprojects system preset names when the locale changes', async () => {
  let resources!: ReturnType<typeof useGradientPresetCatalog>;
  function View() {
    resources = useGradientPresetCatalog('highlighter-frame-fill');
    return null;
  }
  await act(async () => {
    root?.render(<View />);
    await Promise.resolve();
  });
  expect(resources.presets[0]?.name).toBe('en:highlighter.paintPicker.systemPresets.sunset');
  mocks.locale = 'ru';
  await act(async () => root?.render(<View />));
  expect(resources.presets[0]?.name).toBe('ru:highlighter.paintPicker.systemPresets.sunset');
});

it('preserves a customized system name instead of replacing it with localization', async () => {
  const catalog = createDefaultGradientPresetCatalog();
  catalog.presets[0]!.name = 'My sunset';
  catalog.presets[0]!.customized = true;
  mocks.load.mockResolvedValue(catalog);
  function View() {
    const resources = useGradientPresetCatalog('highlighter-frame-fill');
    return <span>{resources.presets[0]?.name}</span>;
  }
  await act(async () => {
    root?.render(<View />);
    await Promise.resolve();
  });
  expect(host?.textContent).toBe('My sunset');
});

it('surfaces load and mutation failures without an unhandled rejection', async () => {
  mocks.load.mockRejectedValueOnce(new Error('unavailable'));
  let resources!: ReturnType<typeof useGradientPresetCatalog>;
  function View() {
    resources = useGradientPresetCatalog('highlighter-frame-fill');
    return null;
  }
  await act(async () => {
    root?.render(<View />);
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledWith('en:highlighter.paintPicker.loadError', 'error');
  mocks.add.mockResolvedValueOnce('rejected');
  const gradient = createDefaultGradientPresetCatalog().presets[0]!.gradient;
  let outcome: boolean | undefined;
  await act(async () => {
    outcome = await resources.actions.onSave('Mine', gradient);
  });
  expect(mocks.toast).toHaveBeenCalledWith('en:highlighter.paintPicker.saveError', 'error');
  expect(outcome).toBe(false);
});

it('does not publish an older post-mutation refresh over a newer result', async () => {
  type Catalog = ReturnType<typeof createDefaultGradientPresetCatalog>;
  const catalog = createDefaultGradientPresetCatalog();
  catalog.presets.push({
    ...structuredClone(catalog.presets[0]!),
    id: 'user-race',
    name: 'Initial',
    origin: 'user',
  });
  let resources!: ReturnType<typeof useGradientPresetCatalog>;
  function View() {
    resources = useGradientPresetCatalog('highlighter-frame-fill');
    return null;
  }
  await act(async () => {
    root?.render(<View />);
    await Promise.resolve();
  });
  let resolveOlder!: (catalog: Catalog) => void;
  let resolveNewer!: (catalog: Catalog) => void;
  const older = new Promise<Catalog>((resolve) => {
    resolveOlder = resolve;
  });
  const newer = new Promise<Catalog>((resolve) => {
    resolveNewer = resolve;
  });
  mocks.load.mockImplementationOnce(() => older).mockImplementationOnce(() => newer);
  const first = resources.actions.onUpdate('first', catalog.presets[0]!.gradient);
  const second = resources.actions.onUpdate('second', catalog.presets[0]!.gradient);
  const newerCatalog = structuredClone(catalog);
  newerCatalog.presets.find((preset) => preset.id === 'user-race')!.name = 'Newer';
  await act(async () => resolveNewer(newerCatalog));
  const olderCatalog = structuredClone(catalog);
  olderCatalog.presets.find((preset) => preset.id === 'user-race')!.name = 'Older';
  await act(async () => resolveOlder(olderCatalog));
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(resources.presets.find((preset) => preset.id === 'user-race')?.name).toBe('Newer');
});
