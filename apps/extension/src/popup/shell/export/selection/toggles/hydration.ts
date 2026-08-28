import { useEffect, type MutableRefObject } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES,
  loadPopupPagePackagePreferences,
  type PopupPagePackagePreferences,
} from '../../../../../composition/persistence/popup-export-preferences';
import type { PopupPagePackagePreferenceState } from '../../session/types';
import { applyPopupExportSelection } from './selection';
import { consumePopupExportLaunchSelection } from '../launch-selection';

const logger = createLogger({ namespace: 'PopupExportToggles' });

type PopupPackagePreferenceSetters = {
  export: PopupPagePackagePreferenceState;
  save: PopupPagePackagePreferenceState;
};

function applyHydratedPreferences(
  stored: PopupPagePackagePreferences,
  setters: PopupPackagePreferenceSetters
): PopupPagePackagePreferences {
  const hydrated = {
    export: {
      ...stored.export,
      ...consumePopupExportLaunchSelection(),
    },
    save: stored.save,
  };
  applyPopupExportSelection(hydrated.export, setters.export.actions);
  applyPopupExportSelection(hydrated.save, setters.save.actions);
  setters.export.setIncludeWebCopy(hydrated.export.includeWebCopy);
  setters.save.setIncludeWebCopy(hydrated.save.includeWebCopy);
  return hydrated;
}

export function hydratePopupPagePackagePreferences(params: {
  committedPreferencesRef: MutableRefObject<PopupPagePackagePreferences | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  loadPreferences?: typeof loadPopupPagePackagePreferences;
  log?: Pick<typeof logger, 'debug'>;
  onHydrated?: () => void;
  setters: PopupPackagePreferenceSetters;
}) {
  if (params.hasLoadedPreferencesRef.current) return () => {};

  const loadPreferences = params.loadPreferences ?? loadPopupPagePackagePreferences;
  const log = params.log ?? logger;
  let cancelled = false;

  void loadPreferences()
    .catch((error) => {
      log.debug('Failed to hydrate page-package preferences', error);
      return DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES;
    })
    .then((stored) => {
      if (cancelled) return;
      const hydrated = applyHydratedPreferences(stored, params.setters);
      params.committedPreferencesRef.current = hydrated;
      params.hasLoadedPreferencesRef.current = true;
      params.onHydrated?.();
    });

  return () => {
    cancelled = true;
  };
}

export function usePopupExportHydration(params: {
  committedPreferencesRef: MutableRefObject<PopupPagePackagePreferences | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  onHydrated: () => void;
  setters: PopupPackagePreferenceSetters;
}) {
  useEffect(
    () =>
      hydratePopupPagePackagePreferences({
        committedPreferencesRef: params.committedPreferencesRef,
        hasLoadedPreferencesRef: params.hasLoadedPreferencesRef,
        onHydrated: params.onHydrated,
        setters: params.setters,
      }),
    [
      params.committedPreferencesRef,
      params.hasLoadedPreferencesRef,
      params.onHydrated,
      params.setters,
    ]
  );
}
