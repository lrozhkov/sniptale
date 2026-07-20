import { useEffect, type MutableRefObject } from 'react';

import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { savePopupExportPreferences } from '../../../../../composition/persistence/popup-export-preferences';
import type {
  PopupExportPreferenceActions,
  PopupExportPreferenceValues,
  PopupExportSelection,
} from '../../session/types';
import {
  applyPopupExportSelection,
  arePopupExportSelectionsEqual,
  toPopupExportSelection,
} from './selection';

const logger = createLogger({ namespace: 'PopupExportToggles' });

export async function persistPopupExportPreferences(params: {
  committedPreferencesRef: MutableRefObject<PopupExportSelection | null>;
  hasLoadedPreferencesRef: MutableRefObject<boolean>;
  log?: Pick<typeof logger, 'debug'>;
  onPersistError?: () => void;
  preferenceActions: PopupExportPreferenceActions;
  preferences: PopupExportPreferenceValues;
  restoringPreferencesRef: MutableRefObject<boolean>;
  savePreferences?: typeof savePopupExportPreferences;
}) {
  const savePreferences = params.savePreferences ?? savePopupExportPreferences;
  const log = params.log ?? logger;

  if (!params.hasLoadedPreferencesRef.current) {
    return;
  }

  if (params.restoringPreferencesRef.current) {
    params.restoringPreferencesRef.current = false;
    return;
  }

  const nextSelection = toPopupExportSelection(params.preferences);
  if (!params.committedPreferencesRef.current) {
    params.committedPreferencesRef.current = nextSelection;
    return;
  }

  if (arePopupExportSelectionsEqual(nextSelection, params.committedPreferencesRef.current)) {
    return;
  }

  try {
    await savePreferences(nextSelection);
    params.committedPreferencesRef.current = nextSelection;
  } catch (error) {
    log.debug('Failed to persist export preferences', error);
    params.restoringPreferencesRef.current = true;
    applyPopupExportSelection(params.committedPreferencesRef.current, params.preferenceActions);
    params.onPersistError?.();
  }
}

export function usePopupExportPersistence(
  committedPreferencesRef: MutableRefObject<PopupExportSelection | null>,
  hasLoadedPreferencesRef: MutableRefObject<boolean>,
  preferences: PopupExportPreferenceValues,
  preferenceActions: PopupExportPreferenceActions,
  restoringPreferencesRef: MutableRefObject<boolean>
) {
  const {
    includeBasicLogs,
    includeCssDiagnostics,
    includeFiles,
    includeFullPageScreenshot,
    includeHarDomLogs,
    includeImages,
    includeJson,
    includeMarkdown,
  } = preferences;

  useEffect(
    () =>
      void persistPopupExportPreferences({
        committedPreferencesRef,
        hasLoadedPreferencesRef,
        onPersistError: () => {
          toast.error(translate('common.states.error'));
        },
        preferenceActions,
        preferences,
        restoringPreferencesRef,
      }),
    [
      committedPreferencesRef,
      hasLoadedPreferencesRef,
      includeBasicLogs,
      includeCssDiagnostics,
      includeFiles,
      includeFullPageScreenshot,
      includeHarDomLogs,
      includeImages,
      includeJson,
      includeMarkdown,
      preferenceActions,
      preferences,
      restoringPreferencesRef,
    ]
  );
}
