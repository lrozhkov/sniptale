// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { createDefaultCalloutSettings } from '../callout/model';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  create: vi.fn(),
  listener: null as ((catalog: CalloutPresetCatalog) => void) | null,
  load: vi.fn<() => Promise<CalloutPresetCatalog>>(),
}));

vi.mock('../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/callout-presets')>()),
  createUserCalloutPreset: mocks.create,
  loadCalloutPresetCatalog: mocks.load,
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
  latest = useCalloutPresetPopoverController({
    applyPreset: mocks.apply,
    isOpen,
    localSettings: createDefaultCalloutSettings(),
  });
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
  mocks.apply.mockReset();
  mocks.create.mockReset().mockResolvedValue({ id: 'user-created', outcome: 'applied' });
  mocks.load.mockReset();
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

  expect(latest?.catalog?.defaultPresetId).toBe('system-callout-card');
});

it('ignores a stale initial rejection after a subscription snapshot', async () => {
  let rejectLoad: ((reason: Error) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((_, reject) => (rejectLoad = reject)));
  await act(async () => root?.render(<Harness />));

  const subscribed = createCatalog('system-callout-card');
  await act(async () => mocks.listener?.(subscribed));
  await act(async () => rejectLoad?.(new Error('stale load')));

  expect(latest?.catalog?.defaultPresetId).toBe('system-callout-card');
  expect(latest?.error).toBeNull();
});

it('ignores a stale post-mutation refresh after a subscription snapshot', async () => {
  mocks.load.mockResolvedValueOnce(createCatalog('system-callout-bubble'));
  await act(async () => root?.render(<Harness />));
  let resolveRefresh: ((catalog: CalloutPresetCatalog) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveRefresh = resolve)));

  let save: Promise<void> | undefined;
  await act(async () => {
    save = latest?.save('Saved preset');
    await Promise.resolve();
  });
  const subscribed = createCatalog('system-callout-card');
  await act(async () => mocks.listener?.(subscribed));
  await act(async () => {
    resolveRefresh?.(createCatalog('system-callout-bubble'));
    await save;
  });

  expect(latest?.catalog?.defaultPresetId).toBe('system-callout-card');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('does not refresh or apply a saved preset after the popover session closes', async () => {
  mocks.load.mockResolvedValueOnce(createCatalog('system-callout-bubble'));
  let resolveCreate: ((result: { id: string; outcome: 'applied' }) => void) | undefined;
  mocks.create.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));
  await act(async () => root?.render(<Harness />));

  let save: Promise<void> | undefined;
  await act(async () => {
    save = latest?.save('Saved preset');
    await Promise.resolve();
  });
  isOpen = false;
  await act(async () => root?.render(<Harness />));
  await act(async () => {
    resolveCreate?.({ id: 'user-created', outcome: 'applied' });
    await save;
  });

  expect(mocks.load).toHaveBeenCalledOnce();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(latest?.error).toBeNull();
});
