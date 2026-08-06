// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  listener: null as ((catalog: CalloutPresetCatalog) => void) | null,
  load: vi.fn<() => Promise<CalloutPresetCatalog>>(),
  reset: vi.fn(),
  setEnabled: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/callout-presets')>()),
  createUserCalloutPreset: mocks.create,
  loadCalloutPresetCatalog: mocks.load,
  resetSystemCalloutPreset: mocks.reset,
  setCalloutPresetEnabled: mocks.setEnabled,
  updateCalloutPreset: mocks.update,
  subscribeToCalloutPresetCatalog: (listener: (catalog: CalloutPresetCatalog) => void) => {
    mocks.listener = listener;
    return () => undefined;
  },
}));

import { useCalloutPresetPopoverController } from './preset-controller';

function createCatalog(defaultPresetId: string): CalloutPresetCatalog {
  return {
    catalogCustomized: false,
    defaultPresetId,
    presets: createSystemCalloutPresetCatalog(),
    systemCatalogRevision: 1,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useCalloutPresetPopoverController> | null = null;
let isOpen = true;

function Harness() {
  latest = useCalloutPresetPopoverController(isOpen);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
  isOpen = true;
  mocks.listener = null;
  mocks.create.mockReset().mockResolvedValue({ outcome: 'applied', id: 'user-new' });
  mocks.load.mockReset().mockResolvedValue(createCatalog('system-callout-bubble'));
  mocks.reset.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.setEnabled.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.update.mockReset().mockResolvedValue({ outcome: 'applied' });
});

it('creates and overwrites presets through the canonical catalog owner', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.value?.presets[0];
  expect(preset).toBeDefined();
  if (!preset) return;

  const createInput = { name: 'Saved manually', placement: preset.placement, style: preset.style };
  await act(async () => {
    expect(await latest?.catalog.create(createInput)).toBe(true);
  });
  await act(async () => {
    expect(
      await latest?.catalog.overwrite({
        id: preset.id,
        name: preset.name,
        placement: preset.placement,
        style: preset.style,
      })
    ).toBe(true);
  });

  expect(mocks.create).toHaveBeenCalledWith(createInput);
  expect(mocks.update).toHaveBeenCalledWith({
    id: preset.id,
    name: preset.name,
    placement: preset.placement,
    style: preset.style,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('ignores a stale initial read after a subscription snapshot', async () => {
  let resolveLoad: ((catalog: CalloutPresetCatalog) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
  await act(async () => root?.render(<Harness />));

  const subscribed = createCatalog('system-callout-card');
  await act(async () => mocks.listener?.(subscribed));
  await act(async () => resolveLoad?.(createCatalog('system-callout-bubble')));

  expect(latest?.catalog.value?.defaultPresetId).toBe('system-callout-card');
});

it('ignores a stale initial rejection after a subscription snapshot', async () => {
  let rejectLoad: ((reason: Error) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((_, reject) => (rejectLoad = reject)));
  await act(async () => root?.render(<Harness />));

  const subscribed = createCatalog('system-callout-card');
  await act(async () => mocks.listener?.(subscribed));
  await act(async () => rejectLoad?.(new Error('stale load')));

  expect(latest?.catalog.value?.defaultPresetId).toBe('system-callout-card');
  expect(latest?.catalog.error).toBeNull();
});

it('refreshes the open catalog and reveals a newly saved template', async () => {
  await act(async () => root?.render(<Harness />));
  const refreshed = createCatalog('system-callout-bubble');
  const source = refreshed.presets[0]!;
  refreshed.presets = [
    ...refreshed.presets,
    {
      ...source,
      id: 'user-new',
      name: 'New template',
      order: refreshed.presets.length,
      origin: 'user',
    },
  ];
  mocks.load.mockResolvedValueOnce(refreshed);

  await act(async () => latest?.catalog.refresh());

  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(latest?.catalog.visiblePresets.some((preset) => preset.id === 'user-new')).toBe(true);
});

it('does not publish a delayed load after the popover session closes', async () => {
  let resolveLoad: ((catalog: CalloutPresetCatalog) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
  await act(async () => root?.render(<Harness />));

  isOpen = false;
  await act(async () => root?.render(<Harness />));
  await act(async () => resolveLoad?.(createCatalog('system-callout-card')));

  expect(mocks.load).toHaveBeenCalledOnce();
  expect(latest?.catalog.value).toBeNull();
});

it('toggles a preset through the persistence owner and keeps it visible for this session', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.value?.presets.find((item) => item.id === 'system-callout-card');
  expect(preset).toBeDefined();

  await act(async () => preset && latest?.catalog.toggle(preset));
  const hiddenCatalog = createCatalog('system-callout-bubble');
  hiddenCatalog.presets = hiddenCatalog.presets.map((item) =>
    item.id === preset?.id ? { ...item, enabled: false } : item
  );
  await act(async () => mocks.listener?.(hiddenCatalog));

  expect(mocks.setEnabled).toHaveBeenCalledWith('system-callout-card', false);
  expect(latest?.catalog.visiblePresets.some((item) => item.id === 'system-callout-card')).toBe(
    true
  );
  expect(latest?.catalog.pendingPresetIds.size).toBe(0);
});

it('opens the persistent editor and saves the selected preset through the catalog owner', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.value?.presets[0];
  expect(preset).toBeDefined();

  await act(async () => preset && latest?.editor.open(preset));
  expect(latest?.editor).toMatchObject({ isOpen: true, preset: { id: preset?.id } });

  await act(async () => preset && latest?.editor.save({ ...preset, name: 'Updated preset' }));

  expect(mocks.update).toHaveBeenCalledWith({
    content: preset?.content,
    id: preset?.id,
    name: 'Updated preset',
    placement: preset?.placement,
    style: preset?.style,
  });
  expect(latest?.editor.isOpen).toBe(false);
});

it('resets a customized system preset through the persistence owner', async () => {
  const catalog = createCatalog('system-callout-bubble');
  catalog.presets = catalog.presets.map((preset, index) =>
    index === 0 ? { ...preset, customized: true } : preset
  );
  mocks.load.mockResolvedValueOnce(catalog);
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.value?.presets[0];
  expect(preset?.customized).toBe(true);

  await act(async () => preset && latest?.editor.open(preset));
  await act(async () => preset && latest?.editor.reset(preset));

  expect(mocks.reset).toHaveBeenCalledWith(preset?.id);
  expect(latest?.editor.isOpen).toBe(false);
});
