import { expect, it, vi } from 'vitest';
import { DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES } from '../../../../../composition/persistence/popup-export-preferences';
import { persistPopupPagePackagePreferences } from './persistence';

function createPreferenceState(selection = DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export) {
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
    includeWebCopy: selection.includeWebCopy,
    setIncludeWebCopy: vi.fn(),
    values: selection,
  };
}

it('persists both changed destinations as one authority', async () => {
  const savePreferences = vi.fn(async () => undefined);
  const committed = { current: DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES };
  const exportState = createPreferenceState({
    ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
    includeWebCopy: true,
  });
  const saveState = createPreferenceState({
    ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save,
    includeJson: true,
  });

  await persistPopupPagePackagePreferences({
    committedPreferencesRef: committed,
    hasLoadedPreferencesRef: { current: true },
    preferences: { export: exportState, save: saveState },
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(savePreferences).toHaveBeenCalledWith({
    export: expect.objectContaining({ includeWebCopy: true }),
    save: expect.objectContaining({ includeJson: true, includeWebCopy: true }),
  });
});

it('persists a Download Web-copy-only change', async () => {
  const savePreferences = vi.fn(async () => undefined);
  const exportState = createPreferenceState({
    ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
    includeWebCopy: true,
  });

  await persistPopupPagePackagePreferences({
    committedPreferencesRef: { current: DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES },
    hasLoadedPreferencesRef: { current: true },
    preferences: {
      export: exportState,
      save: createPreferenceState(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save),
    },
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(savePreferences).toHaveBeenCalledWith(
    expect.objectContaining({ export: expect.objectContaining({ includeWebCopy: true }) })
  );
});

it('rolls both destinations back after a failed write', async () => {
  const exportState = createPreferenceState({
    ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
    includeJson: false,
  });
  const saveState = createPreferenceState(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save);
  const onPersistError = vi.fn();

  await persistPopupPagePackagePreferences({
    committedPreferencesRef: { current: DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES },
    hasLoadedPreferencesRef: { current: true },
    onPersistError,
    preferences: { export: exportState, save: saveState },
    restoringPreferencesRef: { current: false },
    savePreferences: vi.fn(async () => {
      throw new Error('quota');
    }),
  });

  expect(exportState.actions.setIncludeJson).toHaveBeenCalledWith(true);
  expect(saveState.setIncludeWebCopy).toHaveBeenCalledWith(true);
  expect(onPersistError).toHaveBeenCalledOnce();
});
