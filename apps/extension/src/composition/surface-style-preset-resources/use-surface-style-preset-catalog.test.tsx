// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSurfaceStylePresetCatalog } from '../persistence/surface-style-presets/catalog';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  delete: vi.fn(),
  duplicate: vi.fn(),
  edit: vi.fn(),
  enabled: vi.fn(),
  load: vi.fn(),
  rename: vi.fn(),
  reorder: vi.fn(),
  reset: vi.fn(),
  resetPreset: vi.fn(),
  setDefault: vi.fn(),
  subscribe: vi.fn(),
  toast: vi.fn(),
  toggle: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../persistence/surface-style-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/surface-style-presets')>()),
  addSurfaceStylePreset: mocks.add,
  deleteSurfaceStylePreset: mocks.delete,
  duplicateSurfaceStylePreset: mocks.duplicate,
  editSurfaceStylePreset: mocks.edit,
  loadSurfaceStylePresetCatalog: mocks.load,
  renameSurfaceStylePreset: mocks.rename,
  reorderSurfaceStylePresets: mocks.reorder,
  resetSurfaceStylePresetCatalog: mocks.reset,
  resetSurfaceStylePreset: mocks.resetPreset,
  setDefaultSurfaceStylePresetId: mocks.setDefault,
  subscribeToSurfaceStylePresetCatalog: mocks.subscribe,
  toggleSurfaceStylePresetFavorite: mocks.toggle,
  toggleSurfaceStylePresetEnabled: mocks.enabled,
  updateSurfaceStylePreset: mocks.update,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));

import { useSurfaceStylePresetCatalog } from './use-surface-style-preset-catalog';

let latest!: ReturnType<typeof useSurfaceStylePresetCatalog>;
let root: Root | null = null;
function Harness() {
  latest = useSurfaceStylePresetCatalog();
  return null;
}

beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(createSurfaceStylePresetCatalog());
  mocks.subscribe.mockReset().mockReturnValue(() => undefined);
  mocks.toast.mockReset();
  for (const mutation of [
    mocks.add,
    mocks.delete,
    mocks.duplicate,
    mocks.edit,
    mocks.enabled,
    mocks.rename,
    mocks.reorder,
    mocks.reset,
    mocks.resetPreset,
    mocks.setDefault,
    mocks.toggle,
    mocks.update,
  ]) {
    mutation.mockReset();
  }
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('loads localized systems and ignores a stale initial load after a subscription publication', async () => {
  let resolveLoad!: (value: ReturnType<typeof createSurfaceStylePresetCatalog>) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );
  let publish!: (value: ReturnType<typeof createSurfaceStylePresetCatalog>) => void;
  mocks.subscribe.mockImplementation((listener) => {
    publish = listener;
    return () => undefined;
  });
  const mountedRoot = createRoot(document.body.appendChild(document.createElement('div')));
  root = mountedRoot;
  await act(async () => mountedRoot.render(<Harness />));
  const newer = createSurfaceStylePresetCatalog({ catalogRevision: 2 });
  await act(async () => publish(newer));
  await act(async () => resolveLoad(createSurfaceStylePresetCatalog({ catalogRevision: 0 })));
  expect(latest.catalog?.catalogRevision).toBe(2);
  expect(latest.presets[0]?.name).toBe('Обычный');
});

it('maps every catalog action and typed failure to controlled feedback', async () => {
  const user = {
    id: 'user-one',
    name: 'User',
    order: 0,
    origin: 'user' as const,
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
  };
  const catalog = createSurfaceStylePresetCatalog({ catalogRevision: 7, users: [user] });
  mocks.load.mockResolvedValue(catalog);
  const applied = { outcome: 'applied', catalog };
  for (const mutation of [
    mocks.add,
    mocks.delete,
    mocks.duplicate,
    mocks.edit,
    mocks.enabled,
    mocks.rename,
    mocks.reorder,
    mocks.reset,
    mocks.resetPreset,
    mocks.setDefault,
    mocks.toggle,
    mocks.update,
  ]) {
    mutation.mockResolvedValue(applied);
  }
  mocks.reset.mockResolvedValue({ outcome: 'unchanged', catalog });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    vi.stubGlobal('crypto', undefined);
    expect(await latest.actions.onCreate('New', user.style)).toBe(true);
    vi.unstubAllGlobals();
    expect(await latest.actions.onUpdate(user.id, user.style)).toBe(true);
    expect(await latest.actions.onRename(user.id, 'Renamed')).toBe(true);
    expect(await latest.actions.onDuplicate(user.id, 'Copy')).toBe(true);
    expect(await latest.actions.onDelete(user.id)).toBe(true);
    expect(await latest.actions.onReorder([user.id])).toBe(true);
    expect(await latest.actions.onEdit(user.id, 'Edited', user.style)).toBe(true);
    expect(await latest.actions.onToggleEnabled(user.id)).toBe(true);
    expect(await latest.actions.onSetDefault(user.id)).toBe(true);
    expect(await latest.actions.onResetPreset('system-surface-frosted-light')).toBe(true);
    expect(await latest.actions.onToggleFavorite(user.id)).toBe(true);
    expect(await latest.actions.onReset()).toBe(true);
  });
  expect(mocks.add).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'New' }));
  expect(mocks.duplicate).toHaveBeenCalledWith(
    7,
    user.id,
    expect.objectContaining({ name: 'Copy', style: user.style })
  );
  expect(mocks.edit).toHaveBeenCalledWith(7, user.id, 'Edited', user.style);
  expect(mocks.enabled).toHaveBeenCalledWith(7, user.id);
  expect(mocks.setDefault).toHaveBeenCalledWith(7, user.id);
  expect(mocks.resetPreset).toHaveBeenCalledWith(7, 'system-surface-frosted-light');

  mocks.delete.mockResolvedValueOnce({ outcome: 'stale-revision', catalog });
  mocks.delete.mockResolvedValueOnce({ outcome: 'quota', catalog });
  mocks.delete.mockResolvedValueOnce({ outcome: 'unsafe-storage', catalog });
  mocks.delete.mockResolvedValueOnce({ outcome: 'rejected', catalog });
  mocks.delete.mockRejectedValueOnce(new Error('failed'));
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      expect(await latest.actions.onDelete(user.id)).toBe(false);
    }
  });
  expect(mocks.toast).toHaveBeenCalledTimes(5);
});

it('reports initial load failures without publishing an unsafe partial catalog', async () => {
  mocks.load.mockRejectedValueOnce(new Error('load failed'));
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root?.render(<Harness />));
  await act(async () => Promise.resolve());
  expect(latest.catalog).toBeNull();
  expect(await latest.actions.onReset()).toBe(false);
  expect(mocks.toast).toHaveBeenCalledOnce();
});
