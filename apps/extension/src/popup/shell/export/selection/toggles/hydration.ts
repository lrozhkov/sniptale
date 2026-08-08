import { useEffect, type MutableRefObject } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DEFAULT_POPUP_EXPORT_PREFERENCES,
  loadPopupExportPreferences,
} from '../../../../../composition/persistence/popup-export-preferences';
import type { PopupExportPreferenceSetters, PopupExportSelection } from '../../session/types';
import { applyPopupExportSelection, toPopupExportSelection } from './selection';
import { consumePopupExportLaunchSelection } from '../launch-selection';

const logger = createLogger({ namespace: 'PopupExportToggles' });

type PopupExportHydrationApplyParams = {
  committedPreferencesRef: MutableRefObject<PopupExportSelection | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  onHydrated?: (() => void) | undefined;
  preferences: PopupExportPreferenceSetters;
};

function applyHydratedPopupExportPreferences(
  storedPreferences: PopupExportSelection,
  params: PopupExportHydrationApplyParams
): void {
  const preferences = {
    ...storedPreferences,
    ...consumePopupExportLaunchSelection(),
  };
  applyPopupExportSelection(preferences, params.preferences);
  params.committedPreferencesRef.current = toPopupExportSelection(preferences);
  params.hasLoadedPreferencesRef.current = true;
  params.onHydrated?.();
}

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
        applyHydratedPopupExportPreferences(storedPreferences, params);
      }
    })
    .catch((error) => {
      if (cancelled) {
        return;
      }

      log.debug('Failed to hydrate export preferences', error);
      applyHydratedPopupExportPreferences(DEFAULT_POPUP_EXPORT_PREFERENCES, params);
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
