// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  loadPreference: vi.fn(),
  savePreference: vi.fn(),
}));

vi.mock('../../persistence/ui-state/floating-layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/ui-state/floating-layers')>()),
  loadEditorFloatingLayersPreference: storageMocks.loadPreference,
  saveEditorFloatingLayersPreference: storageMocks.savePreference,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useFloatingLayersPreferenceState } from './preferences';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useFloatingLayersPreferenceState> | null = null;

function Harness() {
  latestState = useFloatingLayersPreferenceState();
  return <div data-collapsed={String(latestState.layersCollapsed)} />;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  storageMocks.savePreference.mockResolvedValue(undefined);
  latestState = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('hydrates floating layers collapsed and height preference from storage', async () => {
  storageMocks.loadPreference.mockResolvedValue({ collapsed: true, heightRatio: 0.45 });

  await renderHarness();

  expect(latestState?.layersCollapsed).toBe(true);
  expect(latestState?.layersHeightRatio).toBe(0.45);
});

it('persists user updates and does not let late hydration overwrite them', async () => {
  let resolveLoad: (value: { collapsed: boolean; heightRatio: number | null }) => void = () => {};
  storageMocks.loadPreference.mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );

  await renderHarness();
  act(() => latestState?.setLayersCollapsed(true));
  act(() => latestState?.setLayersHeightRatio(0.75));
  await act(async () => resolveLoad({ collapsed: false, heightRatio: 0.25 }));

  expect(latestState?.layersCollapsed).toBe(true);
  expect(latestState?.layersHeightRatio).toBe(0.75);
  expect(storageMocks.savePreference).toHaveBeenNthCalledWith(1, {
    collapsed: true,
    heightRatio: null,
  });
  expect(storageMocks.savePreference).toHaveBeenNthCalledWith(2, {
    collapsed: true,
    heightRatio: 0.75,
  });
});

it('surfaces failed preference saves and clears the inline error on retry', async () => {
  storageMocks.loadPreference.mockResolvedValue({ collapsed: false, heightRatio: null });
  storageMocks.savePreference.mockRejectedValueOnce(new Error('storage unavailable'));

  await renderHarness();
  act(() => latestState?.setLayersCollapsed(true));
  await act(async () => Promise.resolve());
  await act(async () => Promise.resolve());

  expect(latestState?.layersPreferenceError).toBe('editor.toolbar.layersPreferenceSaveFailed');

  storageMocks.savePreference.mockResolvedValueOnce(undefined);
  act(() => latestState?.setLayersCollapsed(false));

  expect(latestState?.layersPreferenceError).toBeNull();
  await act(async () => Promise.resolve());
  await act(async () => Promise.resolve());

  expect(latestState?.layersPreferenceError).toBeNull();
});
