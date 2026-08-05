// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';

const mocks = vi.hoisted(() => ({
  listener: null as ((catalog: StepBadgePresetCatalog) => void) | null,
  load: vi.fn<() => Promise<StepBadgePresetCatalog>>(),
  update: vi.fn(),
}));

vi.mock('../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/step-badge-presets')>()),
  loadStepBadgePresetCatalog: mocks.load,
  subscribeToStepBadgePresetCatalog: (listener: (catalog: StepBadgePresetCatalog) => void) => {
    mocks.listener = listener;
    return () => undefined;
  },
  updateStoredStepBadgePreset: mocks.update,
}));

import { useStepBadgePresetPopoverController } from './preset-controller';

function createCatalog(): StepBadgePresetCatalog {
  const presets = createSystemStepBadgePresetCatalog();
  return {
    catalogCustomized: false,
    defaultPresetId: presets[0]!.id,
    presets,
    systemCatalogRevision: 1,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useStepBadgePresetPopoverController> | null = null;

function Harness() {
  latest = useStepBadgePresetPopoverController(true);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = null;
  mocks.listener = null;
  mocks.load.mockReset().mockResolvedValue(createCatalog());
  mocks.update.mockReset().mockResolvedValue({ outcome: 'applied' });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens the persistent editor and saves the selected template through the catalog owner', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.value?.presets[0];
  expect(preset).toBeDefined();

  await act(async () => preset && latest?.editor.open(preset));
  expect(latest?.editor).toMatchObject({ isOpen: true, preset: { id: preset?.id } });

  await act(async () => preset && latest?.editor.save({ ...preset, name: 'Updated preset' }));

  expect(mocks.update).toHaveBeenCalledWith({
    id: preset?.id,
    name: 'Updated preset',
    settings: preset?.settings,
  });
  expect(latest?.editor.isOpen).toBe(false);
});
