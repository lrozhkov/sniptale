import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  PopupExportPreferenceActions,
  PopupExportPreferenceValues,
  PopupExportSelection,
} from '../../session/types';
import { persistPopupExportPreferences } from './persistence';

function createPreferences(): PopupExportPreferenceValues {
  return {
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createPreferenceActions(): PopupExportPreferenceActions {
  return {
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
  };
}

function createSelection(overrides: Partial<PopupExportSelection> = {}): PopupExportSelection {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: false,
    ...overrides,
  };
}

async function verifySkipBeforeHydration() {
  const loadedRef = { current: false } as MutableRefObject<boolean>;
  const savePreferences = vi.fn();

  await persistPopupExportPreferences({
    committedPreferencesRef: { current: null },
    hasLoadedPreferencesRef: loadedRef,
    preferenceActions: createPreferenceActions(),
    preferences: createPreferences(),
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(savePreferences).not.toHaveBeenCalled();
}

async function verifyInitialCommittedSnapshot() {
  const loadedRef = { current: true } as MutableRefObject<boolean>;
  const committedPreferencesRef = {
    current: null,
  } as MutableRefObject<PopupExportSelection | null>;
  const savePreferences = vi.fn();

  await persistPopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    preferenceActions: createPreferenceActions(),
    preferences: createPreferences(),
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(savePreferences).not.toHaveBeenCalled();
  expect(committedPreferencesRef.current).toEqual(
    createSelection({ includeBasicLogs: true, includeJson: true })
  );
}

async function verifyChangedPreferencesPersist() {
  const loadedRef = { current: true } as MutableRefObject<boolean>;
  const preferences = createPreferences();
  const savePreferences = vi.fn().mockResolvedValue(undefined);
  const committedPreferencesRef = {
    current: createSelection({ includeBasicLogs: false }),
  } as MutableRefObject<PopupExportSelection | null>;

  await persistPopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    preferenceActions: createPreferenceActions(),
    preferences,
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(savePreferences).toHaveBeenCalledWith({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: false,
  });
}

async function verifyRestoreAfterFailure() {
  const loadedRef = { current: true } as MutableRefObject<boolean>;
  const preferences = createPreferences();
  const preferenceActions = createPreferenceActions();
  const debug = vi.fn();
  const savePreferences = vi.fn().mockRejectedValue(new Error('save failed'));
  const committedPreferencesRef = {
    current: createSelection({ includeBasicLogs: false }),
  } as MutableRefObject<PopupExportSelection | null>;
  const onPersistError = vi.fn();

  await persistPopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    log: { debug },
    onPersistError,
    preferenceActions,
    preferences,
    restoringPreferencesRef: { current: false },
    savePreferences,
  });

  expect(debug).toHaveBeenCalledWith('Failed to persist export preferences', expect.any(Error));
  expect(onPersistError).toHaveBeenCalledTimes(1);
  expect(preferenceActions.setIncludeBasicLogs).toHaveBeenCalledWith(false);
}

describe('usePopupExportToggles persistence', () => {
  it('skips persistence before preferences are hydrated', async () => {
    await verifySkipBeforeHydration();
  });

  it('stores the first loaded snapshot without persisting it again', async () => {
    await verifyInitialCommittedSnapshot();
  });

  it('persists changed loaded preferences', async () => {
    await verifyChangedPreferencesPersist();
  });

  it('logs failed persistence writes and restores the committed selection', async () => {
    await verifyRestoreAfterFailure();
  });
});
