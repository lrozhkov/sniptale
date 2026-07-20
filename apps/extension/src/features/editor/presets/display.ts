import { translate } from '../../../platform/i18n';

export function getEditorSystemPresetDisplayName() {
  return translate('shared.defaults.defaultEditorPresetName');
}

export function getEditorPresetDisplayName(args: { isSystemDefault?: boolean; name: string }) {
  return args.isSystemDefault === true ? getEditorSystemPresetDisplayName() : args.name;
}
