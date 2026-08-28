import { useEffect, useRef, type MutableRefObject } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../../platform/i18n/popup';
import {
  savePopupPagePackagePreferences,
  type PopupPagePackagePreferences,
} from '../../../../../composition/persistence/popup-export-preferences';
import type { PopupPagePackagePreferenceState } from '../../session/types';
import {
  applyPopupExportSelection,
  arePopupExportSelectionsEqual,
  toPopupExportSelection,
} from './selection';

const logger = createLogger({ namespace: 'PopupExportToggles' });

function arePreferenceSetsEqual(
  left: PopupPagePackagePreferences,
  right: PopupPagePackagePreferences
) {
  return (
    arePopupExportSelectionsEqual(left.export, right.export) &&
    left.export.includeWebCopy === right.export.includeWebCopy &&
    arePopupExportSelectionsEqual(left.save, right.save) &&
    left.save.includeWebCopy === right.save.includeWebCopy
  );
}

export async function persistPopupPagePackagePreferences(params: {
  committedPreferencesRef: MutableRefObject<PopupPagePackagePreferences | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  log?: Pick<typeof logger, 'debug'>;
  onPersistError?: () => void;
  shouldApplyFailure?: () => boolean;
  preferences: {
    export: PopupPagePackagePreferenceState;
    save: PopupPagePackagePreferenceState;
  };
  restoringPreferencesRef: MutableRefObject<boolean>;
  savePreferences?: typeof savePopupPagePackagePreferences;
}) {
  if (!params.hasLoadedPreferencesRef.current) return;
  if (params.restoringPreferencesRef.current) {
    params.restoringPreferencesRef.current = false;
    return;
  }

  const next = {
    export: {
      ...toPopupExportSelection(params.preferences.export.values),
      includeWebCopy: params.preferences.export.includeWebCopy,
    },
    save: {
      ...toPopupExportSelection(params.preferences.save.values),
      includeWebCopy: params.preferences.save.includeWebCopy,
    },
  };
  const committed = params.committedPreferencesRef.current;
  if (!committed) {
    params.committedPreferencesRef.current = next;
    return;
  }
  if (arePreferenceSetsEqual(next, committed)) return;

  try {
    await (params.savePreferences ?? savePopupPagePackagePreferences)(next);
    params.committedPreferencesRef.current = next;
  } catch (error) {
    (params.log ?? logger).debug('Failed to persist page-package preferences', error);
    if (params.shouldApplyFailure?.() === false) return;
    params.restoringPreferencesRef.current = true;
    applyPopupExportSelection(committed.export, params.preferences.export.actions);
    applyPopupExportSelection(committed.save, params.preferences.save.actions);
    params.preferences.export.setIncludeWebCopy(committed.export.includeWebCopy);
    params.preferences.save.setIncludeWebCopy(committed.save.includeWebCopy);
    params.onPersistError?.();
  }
}

export function usePopupExportPersistence(params: {
  committedPreferencesRef: MutableRefObject<PopupPagePackagePreferences | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  preferences: {
    export: PopupPagePackagePreferenceState;
    save: PopupPagePackagePreferenceState;
  };
  restoringPreferencesRef: MutableRefObject<boolean>;
}) {
  const exportPreferences = params.preferences.export;
  const savePreferences = params.preferences.save;
  const latestAttemptRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const attempt = ++latestAttemptRef.current;
    const persist = () =>
      persistPopupPagePackagePreferences({
        committedPreferencesRef: params.committedPreferencesRef,
        hasLoadedPreferencesRef: params.hasLoadedPreferencesRef,
        onPersistError: () => toast.error(translate('common.states.error')),
        preferences: { export: exportPreferences, save: savePreferences },
        restoringPreferencesRef: params.restoringPreferencesRef,
        shouldApplyFailure: () => latestAttemptRef.current === attempt,
      });
    persistenceQueueRef.current = persistenceQueueRef.current.then(persist, persist);
  }, [
    params.committedPreferencesRef,
    params.hasLoadedPreferencesRef,
    exportPreferences,
    savePreferences,
    params.restoringPreferencesRef,
  ]);
}
