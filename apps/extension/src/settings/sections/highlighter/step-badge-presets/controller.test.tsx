// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../../features/highlighter/step-badge-presets/catalog';

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

vi.mock('../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/step-badge-presets')
  >()),
  createUserStepBadgePreset: mocks.create,
  deleteStoredStepBadgePreset: mocks.delete,
  loadStepBadgePresetCatalog: mocks.load,
  resetStoredSystemStepBadgePreset: mocks.reset,
  setDefaultStoredStepBadgePreset: mocks.setDefault,
  setStoredStepBadgePresetEnabled: mocks.toggle,
  subscribeToStepBadgePresetCatalog: mocks.subscribe,
  updateStoredStepBadgePreset: mocks.update,
  updateStoredStepBadgePresetOrder: mocks.reorder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

import { useStepBadgePresetCatalogController } from './controller';

const catalog = {
  catalogCustomized: false,
  defaultPresetId: 'system-classic',
  presets: createSystemStepBadgePresetCatalog(),
  systemCatalogRevision: 1,
};
let latest: ReturnType<typeof useStepBadgePresetCatalogController> | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const controller = useStepBadgePresetCatalogController();
  latest = controller;
  return (
    <>
      <div
        data-testid="drag-source"
        draggable
        onDragStart={(event) => controller.actions.dragStart(event, 'system-classic')}
      />
      <div
        data-testid="drag-target"
        onDragOver={(event) => controller.actions.dragOver(event, 'system-outline')}
        onDrop={(event) => void controller.actions.drop(event, 'system-outline')}
      />
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.load.mockReset().mockResolvedValue(catalog);
  mocks.subscribe.mockReset().mockReturnValue(() => undefined);
  for (const mutation of [
    mocks.create,
    mocks.delete,
    mocks.reorder,
    mocks.reset,
    mocks.setDefault,
    mocks.toggle,
    mocks.update,
  ]) {
    mutation.mockReset().mockResolvedValue({ outcome: 'applied' });
  }
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

describe('useStepBadgePresetCatalogController', () => {
  it('keeps a newer subscription snapshot over a stale initial read', async () => {
    let resolveLoad: ((value: typeof catalog) => void) | undefined;
    mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
    let listener: ((value: typeof catalog) => void) | undefined;
    mocks.subscribe.mockImplementation((next) => {
      listener = next;
      return () => undefined;
    });
    await act(async () => root?.render(<Harness />));
    await act(async () => listener?.({ ...catalog, defaultPresetId: 'system-outline' }));
    await act(async () => resolveLoad?.(catalog));
    expect(latest?.catalog?.defaultPresetId).toBe('system-outline');
  });

  it('routes CRUD, visibility, default, reset, and ordering through persistence', async () => {
    const { systemPresetKey: _systemPresetKey, ...source } = catalog.presets[0]!;
    const user = {
      ...source,
      id: 'user-1',
      name: 'User',
      order: catalog.presets.length,
      origin: 'user' as const,
    };
    mocks.load.mockResolvedValue({ ...catalog, presets: [...catalog.presets, user] });
    await act(async () => root?.render(<Harness />));
    await act(async () => latest?.actions.save(user));
    await act(async () => latest?.actions.toggle(user.id));
    await act(async () => latest?.actions.setDefault(user.id));
    await act(async () => latest?.actions.reset(catalog.presets[0]!.id));
    await act(async () => latest?.actions.delete(user));
    act(() => latest?.actions.add());
    act(() => latest?.actions.closeEditor());
    act(() => latest?.actions.edit(user));
    act(() => latest?.actions.hover(user.id));
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { effectAllowed: 'none' },
    });
    await act(async () =>
      container?.querySelector('[data-testid="drag-source"]')?.dispatchEvent(dragStart)
    );
    await act(async () =>
      container
        ?.querySelector('[data-testid="drag-target"]')
        ?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    );
    await act(async () =>
      container
        ?.querySelector('[data-testid="drag-target"]')
        ?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    );
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.toggle).toHaveBeenCalledWith(user.id, false);
    expect(mocks.setDefault).toHaveBeenCalledWith(user.id);
    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith(user.id);
    expect(mocks.reorder).toHaveBeenCalled();
  });

  it('keeps the editor open and surfaces rejected and failed writes', async () => {
    mocks.create.mockResolvedValueOnce({ outcome: 'rejected', reason: 'limit' });
    await act(async () => root?.render(<Harness />));
    act(() => latest?.actions.add());
    const draft = { ...catalog.presets[0]!, id: '', name: 'Draft', origin: 'user' as const };
    await act(async () => latest?.actions.save(draft));
    mocks.create.mockRejectedValueOnce(new Error('sync failed'));
    await act(async () => latest?.actions.save(draft));
    expect(latest?.editor.isOpen).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledTimes(2);
  });
});
