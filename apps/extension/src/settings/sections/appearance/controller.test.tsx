// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  getCurrentLocaleMock,
  getStoredLocalePreferenceMock,
  getStoredThemePreferenceMock,
  setAppThemePreferenceMock,
  setLocalePreferenceMock,
  useAppLocaleMock,
  useSettingsStoreMock,
} = vi.hoisted(() => ({
  getCurrentLocaleMock: vi.fn(() => 'ru'),
  getStoredLocalePreferenceMock: vi.fn<() => 'ru' | 'en' | null>(() => 'ru'),
  getStoredThemePreferenceMock: vi.fn<() => 'system' | 'light' | null>(() => 'system'),
  setAppThemePreferenceMock: vi.fn().mockResolvedValue('dark'),
  setLocalePreferenceMock: vi.fn().mockResolvedValue(undefined),
  useAppLocaleMock: vi.fn(() => 'ru'),
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async () => {
  const actual = await vi.importActual('../../../platform/i18n');
  return {
    ...actual,
    getCurrentLocale: getCurrentLocaleMock,
    getStoredLocalePreference: getStoredLocalePreferenceMock,
    setLocalePreference: setLocalePreferenceMock,
    useAppLocale: useAppLocaleMock,
  };
});

vi.mock('../../../ui/theme', async () => {
  const actual = await vi.importActual('../../../ui/theme');
  return {
    ...actual,
    getStoredThemePreference: getStoredThemePreferenceMock,
    setAppThemePreference: setAppThemePreferenceMock,
  };
});

vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: useSettingsStoreMock,
}));

import { useAppearanceSection } from './controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAppearanceSection> | null = null;

function Harness() {
  latestState = useAppearanceSection();
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

function resetAppearanceSectionMocks(): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useSettingsStoreMock.mockReturnValue({
    settings: {
      authenticatedSnapshotAssetsEnabled: true,
      anonymousCrossOriginSnapshotAssetsEnabled: false,
      rawDiagnosticsEnabled: false,
      contextMenu: {
        enabled: true,
        showExport: true,
        showGallery: true,
        showPageLinkCopy: true,
        showImageEditor: true,
        showScreenshots: true,
        showSettings: true,
        showVideo: true,
        showVideoEditor: true,
      },
    },
    updateSettings: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(resetAppearanceSectionMocks);

beforeEach(() => {
  setAppThemePreferenceMock.mockResolvedValue('dark');
  setLocalePreferenceMock.mockResolvedValue(undefined);
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

it('builds all context menu item options and persists context menu updates', async () => {
  await renderHarness();

  expect(latestState?.contextMenuOptions).toHaveLength(8);

  await act(async () => {
    await latestState?.updateContextMenu({ showSettings: false });
  });

  const storeResult = useSettingsStoreMock.mock.results[0];
  if (!storeResult) {
    throw new Error('Expected the settings store mock to be called');
  }

  const { updateSettings } = storeResult.value as {
    updateSettings: ReturnType<typeof vi.fn>;
  };
  expect(updateSettings).toHaveBeenCalledWith({ contextMenu: { showSettings: false } });
});

it('persists the authenticated web snapshot asset preference', async () => {
  await renderHarness();

  await act(async () => {
    await latestState?.updateAuthenticatedSnapshotAssetsEnabled(false);
  });

  const storeResult = useSettingsStoreMock.mock.results[0];
  if (!storeResult) {
    throw new Error('Expected the settings store mock to be called');
  }

  const { updateSettings } = storeResult.value as {
    updateSettings: ReturnType<typeof vi.fn>;
  };
  expect(updateSettings).toHaveBeenCalledWith({
    authenticatedSnapshotAssetsEnabled: false,
  });
});

it('persists the anonymous cross-origin web snapshot asset preference', async () => {
  await renderHarness();

  await act(async () => {
    await latestState?.updateAnonymousCrossOriginSnapshotAssetsEnabled(true);
  });

  const storeResult = useSettingsStoreMock.mock.results[0];
  if (!storeResult) {
    throw new Error('Expected the settings store mock to be called');
  }

  const { updateSettings } = storeResult.value as {
    updateSettings: ReturnType<typeof vi.fn>;
  };
  expect(updateSettings).toHaveBeenCalledWith({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
  });
});

it('persists the raw diagnostics preference', async () => {
  await renderHarness();

  await act(async () => {
    await latestState?.updateRawDiagnosticsEnabled(true);
  });

  const storeResult = useSettingsStoreMock.mock.results[0];
  if (!storeResult) {
    throw new Error('Expected the settings store mock to be called');
  }

  const { updateSettings } = storeResult.value as {
    updateSettings: ReturnType<typeof vi.fn>;
  };
  expect(updateSettings).toHaveBeenCalledWith({
    rawDiagnosticsEnabled: true,
  });
});

it('falls back to the current locale, persists theme and locale changes, and reacts to storage events', async () => {
  getStoredLocalePreferenceMock.mockReturnValueOnce(null);
  getStoredThemePreferenceMock.mockReturnValueOnce(null);

  await renderHarness();

  expect(latestState?.languagePreference).toBe('ru');
  expect(latestState?.preference).toBe('system');

  await act(async () => {
    latestState?.setPreference('dark');
    latestState?.setLanguagePreference('en');
  });

  expect(setAppThemePreferenceMock).toHaveBeenCalledWith('dark');
  expect(setLocalePreferenceMock).toHaveBeenCalledWith('en');

  getStoredThemePreferenceMock.mockReturnValue('light');
  getStoredLocalePreferenceMock.mockReturnValue('en');
  act(() => {
    window.dispatchEvent(new Event('storage'));
  });

  expect(latestState?.preference).toBe('light');
  expect(latestState?.languagePreference).toBe('en');
});
