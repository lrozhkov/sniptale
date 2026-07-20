import { SUPPORTED_LOCALES, translate, type AppLocale } from '../../../platform/i18n';
import type { ContextMenuSettings } from '../../../contracts/settings';

export function buildAppearanceThemeOptions(locale: AppLocale) {
  return [
    {
      value: 'system',
      label: translate('settings.appearance.systemOption', locale),
      description: translate('settings.appearance.systemDescription', locale),
    },
    {
      value: 'light',
      label: translate('settings.appearance.lightOption', locale),
      description: translate('settings.appearance.lightDescription', locale),
    },
    {
      value: 'dark',
      label: translate('settings.appearance.darkOption', locale),
      description: translate('settings.appearance.darkDescription', locale),
    },
  ] as const;
}

export function buildAppearanceLocaleOptions(locale: AppLocale) {
  return SUPPORTED_LOCALES.map((value) => ({
    value,
    label: translate(`common.languages.${value}` as const, locale),
  }));
}

export function buildAppearanceContextMenuOptions(locale: AppLocale): Array<{
  key: Exclude<keyof ContextMenuSettings, 'enabled'>;
  label: string;
}> {
  return [
    {
      key: 'showScreenshots',
      label: translate('settings.appearance.contextMenuScreenshotsLabel', locale),
    },
    {
      key: 'showVideo',
      label: translate('settings.appearance.contextMenuVideoLabel', locale),
    },
    {
      key: 'showExport',
      label: translate('settings.appearance.contextMenuExportLabel', locale),
    },
    {
      key: 'showImageEditor',
      label: translate('settings.appearance.contextMenuImageEditorLabel', locale),
    },
    {
      key: 'showVideoEditor',
      label: translate('settings.appearance.contextMenuVideoEditorLabel', locale),
    },
    {
      key: 'showGallery',
      label: translate('settings.appearance.contextMenuGalleryLabel', locale),
    },
    {
      key: 'showPageLinkCopy',
      label: translate('settings.appearance.contextMenuPageLinkCopyLabel', locale),
    },
    {
      key: 'showSettings',
      label: translate('settings.appearance.contextMenuSettingsLabel', locale),
    },
  ];
}
