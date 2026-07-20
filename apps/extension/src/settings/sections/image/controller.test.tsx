// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

import { useImageSettingsSection } from './controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useImageSettingsSection> | null = null;

function Harness() {
  latestState = useImageSettingsSection();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

function createStoreState(overrides: Record<string, unknown> = {}) {
  return {
    settings: {},
    updateSettings: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useSettingsStoreMock.mockReturnValue(createStoreState());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useImageSettingsSection', () => {
  it('falls back to png and quality 100, then syncs incoming store settings on rerender', async () => {
    await renderHarness();

    expect(latestState?.imageFormat).toBe('png');
    expect(latestState?.imageQuality).toBe(100);
    expect(latestState?.isQualityDisabled).toBe(true);

    useSettingsStoreMock.mockReturnValue(
      createStoreState({
        settings: { imageFormat: 'jpeg', imageQuality: 72 },
        isLoading: true,
      })
    );

    await renderHarness();

    expect(latestState?.imageFormat).toBe('jpeg');
    expect(latestState?.imageQuality).toBe(72);
    expect(latestState?.isLoading).toBe(true);
    expect(latestState?.isQualityDisabled).toBe(false);
  });

  it('updates local state and persists format and quality changes', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStoreMock.mockReturnValue(
      createStoreState({
        settings: { imageFormat: 'png', imageQuality: 100 },
        updateSettings,
      })
    );

    await renderHarness();

    await act(async () => {
      await latestState?.handleFormatChange('webp');
    });

    expect(latestState?.imageFormat).toBe('webp');
    expect(latestState?.isQualityDisabled).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ imageFormat: 'webp' });

    await act(async () => {
      await latestState?.handleQualityChange(61);
    });

    expect(latestState?.imageQuality).toBe(61);
    expect(updateSettings).toHaveBeenCalledWith({ imageQuality: 61 });
  });
});
