// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
}));

const sidebarSharedMocks = vi.hoisted(() => ({
  loadRecentColors: vi.fn(),
  pushRecentColor: vi.fn(),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../composition/persistence/highlighter', async () => {
  const actual = await vi.importActual<
    typeof import('../../../composition/persistence/highlighter')
  >('../../../composition/persistence/highlighter');

  return {
    ...actual,
    loadHighlighterSettings: storageMocks.loadHighlighterSettings,
  };
});

vi.mock('../sidebar-shared', async () => {
  const actual = await vi.importActual<typeof import('../sidebar-shared')>('../sidebar-shared');

  return {
    ...actual,
    loadRecentColors: sidebarSharedMocks.loadRecentColors,
    pushRecentColor: sidebarSharedMocks.pushRecentColor,
  };
});

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),

  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),

  toast: {
    error: toastErrorMock,
  },
}));

import { DEFAULT_BORDER_PRESET } from '../../../composition/persistence/highlighter';
import { useBorderPresetsState, useRecentColorsState } from './actions.state';

function createHookHarness<T>(useHook: () => T) {
  let value: T;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    value = useHook();
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    get value() {
      return value;
    },
    async flush() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    root,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads, sorts, and falls back border presets through the owner state seam', async () => {
  storageMocks.loadHighlighterSettings.mockResolvedValue({
    defaultBorderPresetId: 'beta',
    borderPresets: [
      { ...DEFAULT_BORDER_PRESET, id: 'zulu', name: 'Zulu', order: 2 },
      { ...DEFAULT_BORDER_PRESET, id: 'alpha', name: 'Alpha', order: 1 },
      { ...DEFAULT_BORDER_PRESET, id: 'beta', name: 'Beta', order: 1 },
    ],
  });
  const success = createHookHarness(() => useBorderPresetsState());
  await success.flush();

  expect(success.value.borderPresets.map((preset) => preset.id)).toEqual(['alpha', 'beta', 'zulu']);
  expect(success.value.defaultBorderPresetId).toBe('beta');
  act(() => {
    success.value.appendBorderPreset({
      ...DEFAULT_BORDER_PRESET,
      id: 'aardvark',
      name: 'Aardvark',
    });
  });
  expect(success.value.borderPresets.map((preset) => preset.id)).toEqual([
    'aardvark',
    'alpha',
    'beta',
    'zulu',
  ]);
  success.root.unmount();

  storageMocks.loadHighlighterSettings.mockResolvedValue({
    borderPresets: [],
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  });
  const empty = createHookHarness(() => useBorderPresetsState());
  await empty.flush();

  expect(empty.value.borderPresets).toEqual([DEFAULT_BORDER_PRESET]);
  expect(empty.value.defaultBorderPresetId).toBe(DEFAULT_BORDER_PRESET.id);
  empty.root.unmount();

  storageMocks.loadHighlighterSettings.mockRejectedValueOnce(new Error('failed'));
  const failed = createHookHarness(() => useBorderPresetsState());
  await failed.flush();

  expect(failed.value.borderPresets).toEqual([DEFAULT_BORDER_PRESET]);
  failed.root.unmount();
});

it('loads recent colors, remembers new colors, and tolerates persistence failures', async () => {
  sidebarSharedMocks.loadRecentColors.mockResolvedValue(['#111111']);
  sidebarSharedMocks.pushRecentColor.mockResolvedValue(['#222222', '#111111']);

  const success = createHookHarness(() => useRecentColorsState());
  await success.flush();

  expect(success.value.recentColors).toEqual(['#111111']);
  await act(async () => {
    await success.value.rememberRecentColor('#222222');
  });
  expect(success.value.recentColors).toEqual(['#222222', '#111111']);
  expect(success.value.rememberRecentColor).toEqual(expect.any(Function));
  success.root.unmount();

  sidebarSharedMocks.loadRecentColors.mockRejectedValueOnce(new Error('failed'));
  sidebarSharedMocks.pushRecentColor.mockRejectedValueOnce(new Error('failed'));

  const failed = createHookHarness(() => useRecentColorsState());
  await failed.flush();

  expect(failed.value.recentColors).toEqual([]);
  await act(async () => {
    await failed.value.rememberRecentColor('#333333');
  });
  expect(failed.value.recentColors).toEqual([]);
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
  failed.root.unmount();
});

it('skips transparent and malformed recent color writes', async () => {
  sidebarSharedMocks.loadRecentColors.mockResolvedValue([]);
  sidebarSharedMocks.pushRecentColor.mockResolvedValue(['#222222']);

  const harness = createHookHarness(() => useRecentColorsState());
  await harness.flush();

  await act(async () => {
    await harness.value.rememberRecentColor('transparent');
    await harness.value.rememberRecentColor('#abc');
    await harness.value.rememberRecentColor('#222222');
  });

  expect(sidebarSharedMocks.pushRecentColor).toHaveBeenCalledOnce();
  expect(sidebarSharedMocks.pushRecentColor).toHaveBeenCalledWith('#222222');
  expect(harness.value.recentColors).toEqual(['#222222']);
  harness.root.unmount();
});
