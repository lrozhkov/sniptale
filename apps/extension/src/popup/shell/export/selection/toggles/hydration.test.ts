import { expect, it, vi } from 'vitest';
import { DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES } from '../../../../../composition/persistence/popup-export-preferences';
import { hydratePopupPagePackagePreferences } from './hydration';

function createPreferenceState() {
  return {
    actions: {
      setIncludeAnnotations: vi.fn(),
      setIncludeBasicLogs: vi.fn(),
      setIncludeCssDiagnostics: vi.fn(),
      setIncludeFiles: vi.fn(),
      setIncludeFullPageScreenshot: vi.fn(),
      setIncludePageDiagnostics: vi.fn(),
      setIncludeImages: vi.fn(),
      setIncludeJson: vi.fn(),
      setIncludeMarkdown: vi.fn(),
    },
    includeWebCopy: false,
    setIncludeWebCopy: vi.fn(),
    values: { ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export },
  };
}

it('hydrates both destinations independently', async () => {
  const exportState = createPreferenceState();
  const saveState = createPreferenceState();
  const committed = { current: null };
  const loaded = { current: false };
  const preferences = {
    export: { ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export, includeJson: false },
    save: { ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save, includeJson: true },
  };

  hydratePopupPagePackagePreferences({
    committedPreferencesRef: committed,
    hasLoadedPreferencesRef: loaded,
    loadPreferences: vi.fn(async () => preferences),
    setters: { export: exportState, save: saveState },
  });
  await vi.waitFor(() => expect(loaded.current).toBe(true));

  expect(exportState.actions.setIncludeJson).toHaveBeenCalledWith(false);
  expect(saveState.actions.setIncludeJson).toHaveBeenCalledWith(true);
  expect(saveState.setIncludeWebCopy).toHaveBeenCalledWith(true);
  expect(committed.current).toEqual(preferences);
});

it('does not apply an async result after cleanup', async () => {
  let resolve!: (value: typeof DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES) => void;
  const cleanup = hydratePopupPagePackagePreferences({
    committedPreferencesRef: { current: null },
    hasLoadedPreferencesRef: { current: false },
    loadPreferences: vi.fn(
      () =>
        new Promise<typeof DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES>((next) => {
          resolve = next;
        })
    ),
    setters: { export: createPreferenceState(), save: createPreferenceState() },
  });
  cleanup();
  resolve(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES);
  await Promise.resolve();
});
