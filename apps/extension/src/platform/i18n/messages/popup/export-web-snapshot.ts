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
    ru: 'Открыть веб-снимок',
    en: `Open ${sharedWebSnapshotSingularNameMessage.en}`,
  },
  openWebSnapshotsGallery: {
    ru: 'Открыть в Библиотеке',
    en: 'Open Library',
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
    ru: 'Вложения и сохранение',
    en: 'Attachments and saving',
  },
  webSnapshotWarningsStep: {
    ru: 'Предупреждения',
    en: 'Warnings',
  },
});
