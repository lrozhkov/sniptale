// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../../../features/highlighter/callout-presets/catalog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  load: vi.fn(),
  reorder: vi.fn(),
  reset: vi.fn(),
  setDefault: vi.fn(),
  subscribe: vi.fn(),
  toastError: vi.fn(),
  toggle: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/callout-presets')
  >()),
  createUserCalloutPreset: mocks.create,
  deleteCalloutPreset: mocks.delete,
  loadCalloutPresetCatalog: mocks.load,
  resetSystemCalloutPreset: mocks.reset,
  setCalloutPresetEnabled: mocks.toggle,
  setDefaultCalloutPreset: mocks.setDefault,
  subscribeToCalloutPresetCatalog: mocks.subscribe,
  updateCalloutPreset: mocks.update,
  updateCalloutPresetsOrder: mocks.reorder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

import { useCalloutPresetCatalogController } from './controller';

const catalog = {
  catalogCustomized: false,
  defaultPresetId: 'system-callout-bubble',
  presets: createSystemCalloutPresetCatalog(),
  systemCatalogRevision: 1,
};
let latest: ReturnType<typeof useCalloutPresetCatalogController> | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  latest = useCalloutPresetCatalogController();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.load.mockReset().mockResolvedValue(catalog);
  mocks.subscribe.mockReset().mockReturnValue(() => undefined);
  mocks.create.mockReset().mockResolvedValue({ outcome: 'applied', id: 'user-1' });
  mocks.delete.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.reorder.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.reset.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.setDefault.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.toggle.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.update.mockReset().mockResolvedValue({ outcome: 'applied' });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

describe('useCalloutPresetCatalogController', () => {
  it('loads independently and ignores a stale initial read after a subscription snapshot', async () => {
    let resolveLoad: ((value: typeof catalog) => void) | undefined;
    mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
    let listener: ((value: typeof catalog) => void) | undefined;
    mocks.subscribe.mockImplementation((next) => {
      listener = next;
      return () => undefined;
    });
    await act(async () => root?.render(<Harness />));
    const subscribed = { ...catalog, defaultPresetId: 'system-callout-card' };
    await act(async () => listener?.(subscribed));
    await act(async () => resolveLoad?.(catalog));
    expect(latest?.catalog?.defaultPresetId).toBe('system-callout-card');
  });

  it('routes default changes through the canonical mutation and refreshes', async () => {
    await act(async () => root?.render(<Harness />));
    await act(async () => latest?.actions.setDefault('system-callout-card'));
    expect(mocks.setDefault).toHaveBeenCalledWith('system-callout-card');
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it('routes CRUD, visibility, reset, and ordering without expanding border state', async () => {
    const user = {
      ...catalog.presets[0]!,
      id: 'user-1',
      name: 'User',
      order: catalog.presets.length,
      origin: 'user' as const,
      systemPresetKey: undefined,
    };
    const withUser = { ...catalog, presets: [...catalog.presets, user] };
    mocks.load.mockResolvedValue(withUser);
    await act(async () => root?.render(<Harness />));

    await act(async () => latest?.actions.save(user));
    await act(async () => latest?.actions.toggle(user.id));
    await act(async () => latest?.actions.reset(catalog.presets[0]!.id));
    await act(async () => latest?.actions.delete(user));
    act(() =>
      latest?.actions.dragStart(
        { dataTransfer: { effectAllowed: '' }, preventDefault: vi.fn() },
        catalog.presets[0]!.id
      )
    );
    await act(async () =>
      latest?.actions.drop(
        { dataTransfer: { effectAllowed: '' }, preventDefault: vi.fn() },
        catalog.presets[1]!.id
      )
    );

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id, name: user.name })
    );
    expect(mocks.toggle).toHaveBeenCalledWith(user.id, false);
    expect(mocks.reset).toHaveBeenCalledWith(catalog.presets[0]!.id);
    expect(mocks.delete).toHaveBeenCalledWith(user.id);
    expect(mocks.reorder).toHaveBeenCalledWith(
      expect.arrayContaining(catalog.presets.map((preset) => preset.id))
    );
  });

  it('keeps the editor open and surfaces rejected writes', async () => {
    mocks.create.mockResolvedValue({ outcome: 'rejected', reason: 'limit' });
    await act(async () => root?.render(<Harness />));
    act(() => latest?.actions.add());
    const draft = { ...catalog.presets[0]!, id: '', name: 'Draft', origin: 'user' as const };
    await act(async () => latest?.actions.save(draft));
    expect(latest?.editor.isOpen).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledWith(expect.any(String));
  });
});
