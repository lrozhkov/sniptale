// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useSettingsStoreMock } = vi.hoisted(() => ({
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../../runtime/store/useSettingsStore', async (importOriginal) => ({
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

  it('updates local state and persists format changes', async () => {
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
  });

  it('previews quality locally and persists it only on commit', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStoreMock.mockReturnValue(
      createStoreState({
        settings: { imageFormat: 'webp', imageQuality: 85 },
        updateSettings,
      })
    );

    await renderHarness();

    act(() => latestState?.handleQualityPreview(61));
    expect(latestState?.imageQuality).toBe(61);
    expect(updateSettings).not.toHaveBeenCalled();

    await act(async () => {
      await latestState?.handleQualityCommit(61);
    });

    expect(updateSettings).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith({ imageQuality: 61 });
  });

  it('restores the persisted quality when a commit fails', async () => {
    const updateSettings = vi.fn().mockRejectedValue(new Error('save failed'));
    useSettingsStoreMock.mockReturnValue(
      createStoreState({
        settings: { imageFormat: 'jpeg', imageQuality: 85 },
        updateSettings,
      })
    );

    await renderHarness();
    act(() => latestState?.handleQualityPreview(42));

    await act(async () => {
      await latestState?.handleQualityCommit(42);
    });

    expect(latestState?.imageQuality).toBe(85);
  });

  it('starts from maximum quality and applies built-in and custom profiles', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStoreMock.mockReturnValue(createStoreState({ settings: {}, updateSettings }));
    await renderHarness();

    expect(latestState?.fullPage.policy).toEqual({
      maxFileSizeMiB: 128,
      maxMegapixels: 80,
      minScalePercent: 100,
      profile: 'maximum',
    });

    await act(async () => latestState?.fullPage.handleProfileChange('high-quality'));
    expect(updateSettings).toHaveBeenLastCalledWith({
      fullPageQuality: {
        maxFileSizeMiB: 96,
        maxMegapixels: 80,
        minScalePercent: 75,
        profile: 'high-quality',
      },
    });

    await act(async () => latestState?.fullPage.handleValueCommit('minScalePercent', 40));
    expect(updateSettings).toHaveBeenLastCalledWith({
      fullPageQuality: expect.objectContaining({ minScalePercent: 40, profile: 'custom' }),
    });

    await act(async () => latestState?.fullPage.handleProfileChange('maximum'));
    expect(updateSettings).toHaveBeenLastCalledWith({
      fullPageQuality: {
        maxFileSizeMiB: 128,
        maxMegapixels: 80,
        minScalePercent: 100,
        profile: 'maximum',
      },
    });
  });

  it('rejects an unsafe custom value before persistence and exposes a friendly error key', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useSettingsStoreMock.mockReturnValue(createStoreState({ settings: {}, updateSettings }));
    await renderHarness();

    await act(async () => latestState?.fullPage.handleValueCommit('maxMegapixels', Infinity));

    expect(updateSettings).not.toHaveBeenCalled();
    expect(latestState?.fullPage.error).toBe('imageSettings.section.fullPageInvalidValue');
  });
});
