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
  loadPopupStartupStateMock,
  savePopupStartupSelectionMock,
} = vi.hoisted(() => ({
  getCurrentLocaleMock: vi.fn(() => 'ru'),
  getStoredLocalePreferenceMock: vi.fn<() => 'ru' | 'en' | null>(() => 'ru'),
  getStoredThemePreferenceMock: vi.fn<() => 'system' | 'light' | null>(() => 'system'),
  setAppThemePreferenceMock: vi.fn().mockResolvedValue('dark'),
  setLocalePreferenceMock: vi.fn().mockResolvedValue(undefined),
  useAppLocaleMock: vi.fn(() => 'ru'),
  useSettingsStoreMock: vi.fn(),
  loadPopupStartupStateMock: vi.fn(),
  savePopupStartupSelectionMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/capture-settings/popup-startup')
    >()),
    loadPopupStartupState: loadPopupStartupStateMock,
    savePopupStartupSelection: savePopupStartupSelectionMock,
  })
);

vi.mock('../../../../platform/i18n', async () => {
  const actual = await vi.importActual('../../../../platform/i18n');
  return {
    ...actual,
    getCurrentLocale: getCurrentLocaleMock,
    getStoredLocalePreference: getStoredLocalePreferenceMock,
    setLocalePreference: setLocalePreferenceMock,
    useAppLocale: useAppLocaleMock,
  };
});

vi.mock('../../../../ui/theme', async () => {
  const actual = await vi.importActual('../../../../ui/theme');
  return {
    ...actual,
    getStoredThemePreference: getStoredThemePreferenceMock,
    setAppThemePreference: setAppThemePreferenceMock,
  };
});

vi.mock('../../../runtime/store/useSettingsStore', async (importOriginal) => ({
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
  loadPopupStartupStateMock.mockResolvedValue({ selection: 'remember-last', lastPage: 'home' });
  savePopupStartupSelectionMock.mockResolvedValue({
    selection: 'remember-last',
    lastPage: 'home',
  });
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

  expect(latestState?.contextMenuOptions).toHaveLength(9);
  expect(latestState?.contextMenuOptions).toContainEqual({
    key: 'showWindowResize',
    label: 'Размер окна',
  });

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

it('loads and persists the popup startup destination', async () => {
  loadPopupStartupStateMock.mockResolvedValueOnce({
    selection: 'video:screen',
    lastPage: 'video',
  });
  await renderHarness();

  expect(latestState?.popupStartup.selection).toBe('video:screen');
  expect(latestState?.popupStartup.options.map((option) => option.value)).toEqual([
    'remember-last',
    'menu',
    'screenshots:quick-actions',
    'screenshots:tab',
    'screenshots:desktop',
    'video:tab',
    'video:area',
    'video:camera',
    'video:screen',
    'tools',
    'export',
  ]);

  await act(async () => {
    await latestState?.popupStartup.updateSelection('tools');
  });

  expect(savePopupStartupSelectionMock).toHaveBeenCalledWith('tools');
  expect(latestState?.popupStartup.selection).toBe('tools');
});

it('keeps the default startup destination when preference loading fails', async () => {
  loadPopupStartupStateMock.mockRejectedValueOnce(new Error('storage unavailable'));
  await renderHarness();

  expect(latestState?.popupStartup.loading).toBe(false);
  expect(latestState?.popupStartup.selection).toBe('remember-last');
});

it('rolls back the startup destination when persistence fails', async () => {
  await renderHarness();
  savePopupStartupSelectionMock.mockRejectedValueOnce(new Error('write failed'));

  await act(async () => {
    await latestState?.popupStartup.updateSelection('export');
  });

  expect(latestState?.popupStartup.selection).toBe('remember-last');
});

it('rolls a failed latest startup write back to the last successful queued choice', async () => {
  await renderHarness();
  const first = Promise.withResolvers<unknown>();
  const second = Promise.withResolvers<unknown>();
  savePopupStartupSelectionMock.mockReset();
  savePopupStartupSelectionMock
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  let firstUpdate: Promise<void> | undefined;
  let secondUpdate: Promise<void> | undefined;
  act(() => {
    firstUpdate = latestState?.popupStartup.updateSelection('video:screen');
    secondUpdate = latestState?.popupStartup.updateSelection('export');
  });
  await act(async () => first.resolve(undefined));
  await act(async () => second.reject(new Error('latest write failed')));
  await act(async () => Promise.all([firstUpdate, secondUpdate]));

  expect(savePopupStartupSelectionMock).toHaveBeenNthCalledWith(1, 'video:screen');
  expect(savePopupStartupSelectionMock).toHaveBeenNthCalledWith(2, 'export');
  expect(latestState?.popupStartup.selection).toBe('video:screen');
});

it('ignores startup preference hydration after the settings section unmounts', async () => {
  const deferred = Promise.withResolvers<{
    selection: 'video:tab';
    lastPage: 'video';
  }>();
  loadPopupStartupStateMock.mockReturnValueOnce(deferred.promise);
  await renderHarness();

  act(() => root?.unmount());
  root = null;
  await act(async () => deferred.resolve({ selection: 'video:tab', lastPage: 'video' }));

  expect(savePopupStartupSelectionMock).not.toHaveBeenCalled();
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
