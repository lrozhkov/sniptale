import { defineMessageSource } from '../source';

export const galleryImportModalMessages = defineMessageSource({
  badge: {
    ru: 'Backup Import',
    en: 'Backup Import',
  },
  title: {
    ru: 'Импорт медиатеки',
    en: 'Media library import',
  },
  description: {
    ru: 'Архив проверен. Выберите стратегию разрешения конфликтов.',
    en: 'The archive was validated. Choose a conflict resolution strategy.',
  },
  assets: {
    ru: 'Assets',
    en: 'Assets',
  },
  thumbnails: {
    ru: 'Thumbnails',
    en: 'Thumbnails',
  },
  conflicts: {
    ru: 'Конфликты ID',
    en: 'ID conflicts',
  },
  formatVersionPrefix: {
    ru: 'Версия формата:',
    en: 'Format version:',
  },
  exportedAtPrefix: {
    ru: 'Экспорт создан:',
    en: 'Exported at:',
  },
  replaceTitle: {
    ru: 'Replace',
    en: 'Replace',
  },
  replaceDescription: {
    ru: 'Заменить совпавшие asset содержимым из архива.',
    en: 'Replace matching assets with content from the archive.',
  },
  skipTitle: {
    ru: 'Skip',
    en: 'Skip',
  },
  skipDescription: {
    ru: 'Пропустить конфликтующие asset и импортировать только новые.',
    en: 'Skip conflicting assets and import only new ones.',
  },
  duplicateTitle: {
    ru: 'Duplicate',
    en: 'Duplicate',
  },
  duplicateDescription: {
    ru: 'Импортировать конфликтующие asset как новые записи с новыми ID.',
    en: 'Import conflicting assets as new entries with new IDs.',
  },
});
