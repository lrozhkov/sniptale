import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { hydratePopupExportPreferences } from './hydration';
import type { PopupExportPreferences } from '../../../../../composition/persistence/popup-export-preferences';
import type { PopupExportPreferenceSetters, PopupExportSelection } from '../../session/types';

function createSetters(): PopupExportPreferenceSetters {
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

async function verifyLoadedPreferences() {
  const loadPreferences = vi.fn().mockResolvedValue({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: false,
    includeMarkdown: true,
  });
  const setters = createSetters();
  const committedPreferencesRef = {
    current: null,
  } as MutableRefObject<PopupExportSelection | null>;
  const loadedRef = { current: false } as MutableRefObject<boolean>;

  const cleanup = hydratePopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    loadPreferences,
    preferences: setters,
  });
  await Promise.resolve();

  expect(setters.setIncludeBasicLogs).toHaveBeenCalledWith(true);
  expect(setters.setIncludeJson).toHaveBeenCalledWith(false);
  expect(loadPreferences).toHaveBeenCalledTimes(1);
  expect(loadedRef.current).toBe(true);
  expect(committedPreferencesRef.current).toEqual({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: false,
    includeMarkdown: true,
  });

  cleanup();
}

function verifySkipWhenLoaded() {
  const setters = createSetters();
  const committedPreferencesRef = {
    current: null,
  } as MutableRefObject<PopupExportSelection | null>;
  const loadedRef = { current: true } as MutableRefObject<boolean>;

  const loadPreferences = vi.fn();
  const cleanup = hydratePopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    loadPreferences,
    preferences: setters,
  });

  expect(loadPreferences).not.toHaveBeenCalled();
  expect(cleanup).toEqual(expect.any(Function));
}

async function verifyRejectedHydrationDoesNotMutateAfterCleanup() {
  let rejectPreferences: (error: unknown) => void = () => undefined;
  const loadPreferences = vi.fn(
    () =>
      new Promise<PopupExportPreferences>((_resolve, reject) => {
        rejectPreferences = reject;
      })
  );
  const setters = createSetters();
  const committedPreferencesRef = {
    current: null,
  } as MutableRefObject<PopupExportSelection | null>;
  const loadedRef = { current: false } as MutableRefObject<boolean>;
  const onHydrated = vi.fn();

  const cleanup = hydratePopupExportPreferences({
    committedPreferencesRef,
    hasLoadedPreferencesRef: loadedRef,
    loadPreferences,
    onHydrated,
    preferences: setters,
  });
  cleanup();
  rejectPreferences(new Error('storage failed'));
  await Promise.resolve();

  expect(loadedRef.current).toBe(false);
  expect(committedPreferencesRef.current).toBeNull();
  expect(onHydrated).not.toHaveBeenCalled();
  expect(setters.setIncludeJson).not.toHaveBeenCalled();
}

describe('usePopupExportToggles hydration', () => {
  it('applies loaded preferences once and marks hydration complete', async () => {
    await verifyLoadedPreferences();
  });

  it('does not hydrate when already loaded', () => {
    verifySkipWhenLoaded();
  });

  it(
    'does not mutate preference state when rejected hydration settles after cleanup',
    verifyRejectedHydrationDoesNotMutateAfterCleanup
  );
});
