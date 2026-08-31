import { useRef, useState } from 'react';
import {
  DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES,
  type PopupPagePackagePreferences,
} from '../../../../../composition/persistence/popup-export-preferences';

import { usePopupExportHydration } from './hydration';
import { usePopupExportPersistence } from './persistence';
import { usePopupExportPreferenceState } from './state';

export function usePopupExportToggles() {
  const preferences = usePopupExportPreferenceState(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export);
  const savePreferences = usePopupExportPreferenceState(
    DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save
  );
  const committedPreferencesRef = useRef<PopupPagePackagePreferences | null>(null);
  const hasLoadedPreferencesRef = useRef(false);
  const restoringPreferencesRef = useRef(false);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  usePopupExportHydration({
    committedPreferencesRef,
    hasLoadedPreferencesRef,
    onHydrated: () => {
      setHasLoadedPreferences(true);
    },
    setters: { export: preferences, save: savePreferences },
  });
  usePopupExportPersistence({
    committedPreferencesRef,
    hasLoadedPreferencesRef,
    preferences: { export: preferences, save: savePreferences },
    restoringPreferencesRef,
  });

  return {
    actions: preferences.actions,
    hasLoadedPreferences,
    includeWebCopy: preferences.includeWebCopy,
    save: savePreferences,
    setIncludeWebCopy: preferences.setIncludeWebCopy,
    values: preferences.values,
  };
}
