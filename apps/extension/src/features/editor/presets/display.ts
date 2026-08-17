import { translate, type AppLocale } from '../../../platform/i18n';

export function getEditorSystemPresetDisplayName(locale?: AppLocale) {
  return translate('shared.defaults.defaultEditorPresetName', locale);
}

export function getEditorPresetDisplayName(
  args: { isSystemDefault?: boolean; name: string },
  locale?: AppLocale
) {
  return args.isSystemDefault === true ? getEditorSystemPresetDisplayName(locale) : args.name;
}
