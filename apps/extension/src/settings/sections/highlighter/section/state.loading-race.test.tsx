// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import { useHighlighterSectionState } from './state';

const { loadHighlighterSettingsMock, loggerErrorMock, subscribeToChangesMock, toastErrorMock } =
  vi.hoisted(() => ({
    loadHighlighterSettingsMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    subscribeToChangesMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  HIGHLIGHTER_SETTINGS_KEY: 'sniptale_highlighter_settings',
  loadHighlighterSettings: loadHighlighterSettingsMock,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    subscribeToChanges: subscribeToChangesMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: chrome.storage.AreaName
) => void;

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useHighlighterSectionState> | null = null;
let root: Root | null = null;

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

function createSettings(): HighlighterSettings {
  return {
    borderPresets: [],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultBlurSettings: { amount: 4, blurType: 'gaussian', showBorder: false },
    defaultFocusSettings: { opacity: 0.4, showBorder: true },
  };
}

function HighlighterStateHarness() {
  latestState = useHighlighterSectionState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterStateHarness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadHighlighterSettingsMock.mockReset();
  loggerErrorMock.mockReset();
  subscribeToChangesMock.mockReset();
  subscribeToChangesMock.mockReturnValue(() => undefined);
  toastErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useHighlighterSectionState loading races', () => {
  it('clears loading when the latest refresh fails before the initial load resolves', async () => {
    let storageChangeListener: StorageChangeListener | null = null;
    const initialLoad = createDeferred<HighlighterSettings>();

    subscribeToChangesMock.mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
      return () => undefined;
    });
    loadHighlighterSettingsMock
      .mockReturnValueOnce(initialLoad.promise)
      .mockRejectedValueOnce(new Error('sync failed'));

    await renderHarness();

    act(() => {
      storageChangeListener?.(
        {
          sniptale_highlighter_settings: { newValue: createSettings() },
        },
        'sync'
      );
    });
    await flushEffects();

    expect(latestState?.isLoading).toBe(false);
    expect(latestState?.settings).toBeNull();

    initialLoad.resolve(createSettings());
    await flushEffects();

    expect(latestState?.isLoading).toBe(false);
    expect(latestState?.settings).toBeNull();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to synchronize highlighter settings',
      expect.any(Error)
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
