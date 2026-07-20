import { useEffect, type MutableRefObject } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DEFAULT_POPUP_EXPORT_PREFERENCES,
  loadPopupExportPreferences,
} from '../../../../../composition/persistence/popup-export-preferences';
import type { PopupExportPreferenceSetters, PopupExportSelection } from '../../session/types';
import { applyPopupExportSelection, toPopupExportSelection } from './selection';

const logger = createLogger({ namespace: 'PopupExportToggles' });

export function hydratePopupExportPreferences(params: {
  committedPreferencesRef: MutableRefObject<PopupExportSelection | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  onHydrated?: () => void;
  log?: Pick<typeof logger, 'debug'>;
  loadPreferences?: typeof loadPopupExportPreferences;
  preferences: PopupExportPreferenceSetters;
}) {
  const loadPreferences = params.loadPreferences ?? loadPopupExportPreferences;
  const log = params.log ?? logger;

  if (params.hasLoadedPreferencesRef.current) {
    return () => {};
  }

  let cancelled = false;

  void loadPreferences()
    .then((storedPreferences) => {
      if (!cancelled) {
        applyPopupExportSelection(storedPreferences, params.preferences);
        params.committedPreferencesRef.current = toPopupExportSelection(storedPreferences);
        params.hasLoadedPreferencesRef.current = true;
        params.onHydrated?.();
      }
    })
    .catch((error) => {
      if (cancelled) {
        return;
      }

      log.debug('Failed to hydrate export preferences', error);
      params.committedPreferencesRef.current = toPopupExportSelection(
        DEFAULT_POPUP_EXPORT_PREFERENCES
      );
      params.hasLoadedPreferencesRef.current = true;
      params.onHydrated?.();
    });

  return () => {
    cancelled = true;
  };
}

export function usePopupExportHydration(
  committedPreferencesRef: MutableRefObject<PopupExportSelection | null>,
  hasLoadedPreferencesRef: MutableRefObject<boolean>,
  onHydrated: () => void,
  preferences: PopupExportPreferenceSetters
) {
  useEffect(
    () =>
      hydratePopupExportPreferences({
        committedPreferencesRef,
        hasLoadedPreferencesRef,
        onHydrated,
        preferences,
      }),
    [committedPreferencesRef, hasLoadedPreferencesRef, onHydrated, preferences]
  );
}
