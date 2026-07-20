import { useCallback, useMemo, useState } from 'react';

import { translate } from '../../../../platform/i18n';
import { patchSettings } from '../../../../composition/persistence/settings';
import type { PopupExportController } from '../controller';
import { createWebSnapshotDisclosure, useWebSnapshotDisclosureState } from './snapshot-disclosure';

function useWebSnapshotConfirmationLocals() {
  const [disclosureState, setDisclosureSkipped] = useWebSnapshotDisclosureState();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const disclosure = useMemo(() => createWebSnapshotDisclosure(disclosureState), [disclosureState]);

  return {
    confirmationOpen,
    disclosure,
    preferenceError,
    preferenceSaving,
    rememberChoice,
    setConfirmationOpen,
    setDisclosureSkipped,
    setPreferenceError,
    setPreferenceSaving,
    setRememberChoice,
  };
}

function useWebSnapshotConfirmationActions(
  controller: PopupExportController,
  locals: ReturnType<typeof useWebSnapshotConfirmationLocals>
) {
  const requestConfirmation = useCallback(() => {
    locals.setRememberChoice(false);
    locals.setPreferenceError(null);
    locals.setConfirmationOpen(true);
  }, [locals]);
  const cancelConfirmation = useCallback(() => {
    if (locals.preferenceSaving) return;
    locals.setConfirmationOpen(false);
    locals.setPreferenceError(null);
  }, [locals]);
  const saveSnapshot = useCallback(() => {
    void controller.actions.handleSaveWebSnapshot();
  }, [controller.actions]);
  const confirmWithRemember = useCallback(() => {
    locals.setPreferenceSaving(true);
    locals.setPreferenceError(null);
    void patchSettings({ skipWebSnapshotSaveDisclosure: true })
      .then(() => {
        locals.setDisclosureSkipped(true);
        locals.setConfirmationOpen(false);
        locals.setRememberChoice(false);
        saveSnapshot();
      })
      .catch(() => {
        locals.setPreferenceError(translate('popup.export.webSnapshotDisclosurePreferenceError'));
      })
      .finally(() => locals.setPreferenceSaving(false));
  }, [locals, saveSnapshot]);
  const confirm = useCallback(() => {
    if (locals.preferenceSaving) return;
    if (locals.rememberChoice) {
      confirmWithRemember();
      return;
    }
    locals.setConfirmationOpen(false);
    locals.setPreferenceError(null);
    saveSnapshot();
  }, [confirmWithRemember, locals, saveSnapshot]);

  return { cancelConfirmation, confirm, requestConfirmation };
}

export function useWebSnapshotConfirmationState(controller: PopupExportController) {
  const locals = useWebSnapshotConfirmationLocals();
  const actions = useWebSnapshotConfirmationActions(controller, locals);

  return {
    ...actions,
    confirmation: locals.confirmationOpen ? locals.disclosure : null,
    disclosure: locals.disclosure,
    preferenceError: locals.preferenceError,
    preferenceSaving: locals.preferenceSaving,
    rememberChoice: locals.rememberChoice,
    setRememberChoice: locals.setRememberChoice,
  };
}
