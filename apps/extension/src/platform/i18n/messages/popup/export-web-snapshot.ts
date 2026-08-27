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
  webSnapshotSetupTitle: {
    ru: 'Веб-снимки выключены',
    en: 'Web Snapshots are off',
  },
  webSnapshotSetupDescription: {
    ru: [
      'Функция сохраняет автономную копию страницы с текстом, оформлением, изображениями',
      'и полноразмерным скриншотом. Включите её и выберите доступ к ресурсам в настройках.',
    ].join(' '),
    en: [
      'This feature saves a self-contained copy of the page with its text, layout, images,',
      'and a full-page screenshot. Enable it and choose resource access in Settings.',
    ].join(' '),
  },
  webSnapshotSetupUnavailableTitle: {
    ru: 'Не удалось проверить настройку',
    en: 'Could not check the setting',
  },
  webSnapshotSetupUnavailableDescription: {
    ru: 'Откройте настройки Web-снимков, проверьте параметры и попробуйте снова.',
    en: 'Open Web Snapshot settings, check the options, and try again.',
  },
  webSnapshotSetupPrivacyHint: {
    ru: 'Снимок может содержать видимые личные данные. Проверяйте его перед отправкой.',
    en: 'A snapshot may contain visible personal information. Review it before sharing.',
  },
  webSnapshotSetupClose: {
    ru: 'Закрыть',
    en: 'Close',
  },
  webSnapshotSetupOpenSettings: {
    ru: 'Открыть настройки',
    en: 'Open Settings',
  },
  webSnapshotSaved: {
    ru: 'Веб-снимок сохранён в Библиотеку',
    en: 'Web snapshot saved to Library',
  },
  webSnapshotSavedWithWarnings: {
    ru: 'Веб-снимок сохранён в Библиотеку с предупреждениями',
    en: 'Web snapshot saved to Library with warnings',
  },
  webSnapshotsSaved: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Библиотеку`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Library`,
  },
  webSnapshotsSavedWithWarnings: {
    ru: `${sharedWebSnapshotPluralNameMessage.ru} сохранены в Библиотеку с предупреждениями`,
    en: `${sharedWebSnapshotPluralNameMessage.en} saved to Library with warnings`,
  },
  openWebSnapshot: {
    ru: `Открыть ${sharedWebSnapshotSingularNameMessage.ru}`,
    en: `Open ${sharedWebSnapshotSingularNameMessage.en}`,
  },
  openWebSnapshotsGallery: {
    ru: `Открыть ${sharedWebSnapshotPluralNameMessage.ru} в Библиотеке`,
    en: `Open ${sharedWebSnapshotPluralNameMessage.en} in Library`,
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
    ru: 'Полноразмерный скриншот',
    en: 'Full-page screenshot',
  },
  webSnapshotDomStep: {
    ru: 'Статический документ',
    en: 'Static document',
  },
  webSnapshotStylesStep: {
    ru: 'Стили и шрифты',
    en: 'Styles and fonts',
  },
  webSnapshotAssetsStep: {
    ru: 'Ассеты и сохранение',
    en: 'Assets and saving',
  },
  webSnapshotWarningsStep: {
    ru: 'Предупреждения',
    en: 'Warnings',
  },
});
