import { translate } from '../../../../platform/i18n';
import type { SavePreset } from '../../../../contracts/settings';

export function resolveSavePresetEditorTitle(preset?: SavePreset) {
  return preset
    ? translate('savePresets.editor.editTitle')
    : translate('savePresets.editor.newTitle');
}

export function resolveSavePresetSubmitLabel(props: { preset?: SavePreset; saving: boolean }) {
  if (props.saving) {
    return `${translate('common.states.saving')}...`;
  }

  return props.preset ? translate('common.actions.save') : translate('common.actions.add');
}
