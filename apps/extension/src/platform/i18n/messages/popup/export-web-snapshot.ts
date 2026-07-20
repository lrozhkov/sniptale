import { defineMessageSource } from '../source';
import {
  sharedWebSnapshotPluralNameMessage,
  sharedWebSnapshotSingularNameMessage,
} from '../shared/web-snapshot';

export const popupExportWebSnapshotMessages = defineMessageSource({
  saveWebSnapshotTitle: {
    ru: 'Сохранить снимок',
    en: 'Save snapshot',
  },
  webSnapshotDisclosureTitle: {
    ru: 'Сохранить веб-снимок?',
    en: 'Save this web snapshot?',
  },
  webSnapshotDisclosureBody: {
    ru: [
      'Sniptale сохранит локальную копию страницы в Галерее:',
      'изображение, очищенную разметку и стили, адрес, название страницы, предупреждения',
      'и безопасные диагностические данные. Скрипты, cookies и данные входа не сохраняются.',
    ].join(' '),
    en: [
      'Sniptale will save a local page copy in Gallery: image, cleaned markup and styles,',
      'page address, title, warnings, and safe diagnostics. Scripts, cookies,',
      'and sign-in data are not saved.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsDefault: {
    ru: 'Дополнительные ресурсы страницы не загружаются без вашего разрешения.',
    en: 'Extra page resources are not loaded unless you allow them.',
  },
  webSnapshotDisclosureAssetsLoading: {
    ru: [
      'Проверяем настройки ресурсов. Если у вас включено сохранение ресурсов с этого сайта',
      'или внешних ресурсов, они могут попасть в локальную копию.',
    ].join(' '),
    en: [
      'Resource settings are still being checked. If saving resources from this site',
      'or external resources is enabled, they may be included in the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsUnavailable: {
    ru: [
      'Не удалось проверить настройки ресурсов. Продолжая, вы подтверждаете, что ресурсы',
      'с этого сайта или внешние ресурсы могут попасть в локальную копию, если они включены.',
    ].join(' '),
    en: [
      'Resource settings could not be checked. By continuing, you confirm that resources',
      'from this site or external resources may be included if those options are enabled.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsAuthenticated: {
    ru: [
      'В настройках включено сохранение ресурсов с этого сайта.',
      'Некоторые изображения или стили могут попасть в локальную копию.',
    ].join(' '),
    en: [
      'Saving resources from this site is enabled.',
      'Some images or styles may be included in the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsExternal: {
    ru: [
      'В настройках включены внешние ресурсы.',
      'Sniptale попробует добавить доступные публичные файлы в локальную копию.',
    ].join(' '),
    en: [
      'External resources are enabled.',
      'Sniptale will try to add available public files to the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureAssetsBoth: {
    ru: [
      'В настройках включены ресурсы с этого сайта и внешние ресурсы.',
      'Некоторые изображения, стили или доступные публичные файлы могут попасть в локальную копию.',
    ].join(' '),
    en: [
      'Resources from this site and external resources are enabled.',
      'Some images, styles, or available public files may be included in the local copy.',
    ].join(' '),
  },
  webSnapshotDisclosureCancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  webSnapshotDisclosureConfirm: {
    ru: 'Подтвердить',
    en: 'Confirm',
  },
  webSnapshotDisclosureSkipNextTime: {
    ru: 'Больше не спрашивать',
    en: "Don't ask again",
  },
  webSnapshotDisclosurePreferenceError: {
    ru: 'Не удалось сохранить выбор. Проверьте доступ к настройкам и попробуйте снова.',
    en: 'Could not save this choice. Check settings access and try again.',
  },
  webSnapshotSaved: {
    ru: 'Веб-снимок сохранён в Галерею',
    en: 'Web snapshot saved to Gallery',
  },
  webSnapshotSavedWithWarnings: {
    ru: 'Веб-снимок сохранён в Галерею с предупреждениями',
    en: 'Web snapshot saved to Gallery with warnings',
  },
  webSnapshotsSaved: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Галерею`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Gallery`,
  },
  webSnapshotsSavedWithWarnings: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Галерею с предупреждениями`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Gallery with warnings`,
  },
  openWebSnapshot: {
    ru: `Открыть ${sharedWebSnapshotSingularNameMessage.ru}`,
    en: `Open ${sharedWebSnapshotSingularNameMessage.en}`,
  },
  openWebSnapshotsGallery: {
    ru: `Открыть ${sharedWebSnapshotPluralNameMessage.ru} в Галерее`,
    en: `Open ${sharedWebSnapshotPluralNameMessage.en} in Gallery`,
  },
  webSnapshotSaving: {
    ru: 'Сохраняем веб-снимок...',
    en: 'Saving web snapshot...',
  },
  webSnapshotMissingAssetId: {
    ru: 'Веб-снимок сохранён без идентификатора',
    en: 'Web snapshot saved without an asset id',
  },
  webSnapshotPreviewStep: {
    ru: 'Preview screenshot',
    en: 'Preview screenshot',
  },
  webSnapshotDomStep: {
    ru: 'DOM',
    en: 'DOM',
  },
  webSnapshotStylesStep: {
    ru: 'Styles',
    en: 'Styles',
  },
  webSnapshotAssetsStep: {
    ru: 'Assets',
    en: 'Assets',
  },
  webSnapshotWarningsStep: {
    ru: 'Warnings',
    en: 'Warnings',
  },
});
