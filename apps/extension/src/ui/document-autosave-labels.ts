import { translate } from '../platform/i18n';
export function documentAutosaveLabels() {
  return {
    title: translate('editor.documentActions.autosaveTitle'),
    switch: translate('editor.documentActions.autosaveSwitch'),
    on: translate('editor.documentActions.autosaveOnDescription'),
    off: translate('editor.documentActions.autosaveOffDescription'),
    paused: translate('editor.documentActions.autosaveOffStatus'),
    dirty: translate('common.states.dirty'),
    saving: translate('common.states.saving'),
    saved: translate('common.states.saved'),
    error: translate('editor.documentActions.saveErrorTitle'),
    close: translate('common.actions.close'),
  };
}
