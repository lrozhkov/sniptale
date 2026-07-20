import { useRef, useState } from 'react';

import { usePopupExportHydration } from './hydration';
import { usePopupExportPersistence } from './persistence';
import type { PopupExportSelection } from '../../session/types';
import { usePopupExportPreferenceSetters, usePopupExportPreferenceState } from './state';

export function usePopupExportToggles() {
  const preferences = usePopupExportPreferenceState();
  const setters = usePopupExportPreferenceSetters(preferences);
  const committedPreferencesRef = useRef<PopupExportSelection | null>(null);
  const hasLoadedPreferencesRef = useRef(false);
  const restoringPreferencesRef = useRef(false);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  usePopupExportHydration(
    committedPreferencesRef,
    hasLoadedPreferencesRef,
    () => {
      setHasLoadedPreferences(true);
    },
    setters
  );
  usePopupExportPersistence(
    committedPreferencesRef,
    hasLoadedPreferencesRef,
    preferences.values,
    preferences.actions,
    restoringPreferencesRef
  );

  return {
    actions: preferences.actions,
    hasLoadedPreferences,
    values: preferences.values,
  };
}
