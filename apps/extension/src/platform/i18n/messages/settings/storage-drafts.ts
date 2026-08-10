import { defineMessageSource } from '../source';

export const settingsStorageDraftsMessages = defineMessageSource({
  title: { ru: 'Хранилище и черновики', en: 'Storage and drafts' },
  description: {
    ru: 'Управляйте локальной библиотекой, сроками черновиков и занимаемым местом.',
    en: 'Manage the local library, draft retention, and storage usage.',
  },
  newItemsTitle: { ru: 'Новые материалы', en: 'New items' },
  newItemsDescription: {
    ru: 'Выберите, куда по умолчанию попадут новые снимки, записи и проекты.',
    en: 'Choose where new captures, recordings, and projects go by default.',
  },
  destinationLabel: { ru: 'Куда сохранять новые материалы', en: 'Save new items to' },
  destinationTemporary: { ru: 'В черновики', en: 'Drafts' },
  destinationLibrary: { ru: 'Сразу в библиотеку', en: 'Library immediately' },
  cleanupTitle: { ru: 'Срок хранения черновиков', en: 'Draft retention' },
  cleanupEnabled: {
    ru: 'Автоматически удалять старые черновики',
    en: 'Automatically delete old drafts',
  },
  cleanupEnabledDescription: {
    ru: 'Срок отсчитывается от последнего успешного изменения.',
    en: 'The retention period starts from the last successful change.',
  },
  cleanupDisabledWarning: {
    ru: 'Черновики будут храниться без срока удаления и могут заполнить хранилище.',
    en: 'Drafts will have no expiration and may fill available storage.',
  },
  ordinaryRetention: { ru: 'Изображения и проекты', en: 'Images and projects' },
  videoRetention: { ru: 'Исходные видеозаписи', en: 'Source video recordings' },
  daySuffix: { ru: 'дн.', en: 'days' },
  usageTitle: { ru: 'Использование хранилища', en: 'Storage usage' },
  totalUsage: { ru: 'Всего занято', en: 'Total used' },
  libraryUsage: { ru: 'Библиотека', en: 'Library' },
  draftsUsage: { ru: 'Черновики', en: 'Drafts' },
  availableUsage: { ru: 'Доступно', en: 'Available' },
  openDrafts: { ru: 'Открыть черновики', en: 'Open drafts' },
  deleteExpired: { ru: 'Удалить просроченные', en: 'Delete expired drafts' },
  deleteAll: { ru: 'Удалить все черновики', en: 'Delete all drafts' },
  deleteAllConfirm: {
    ru: 'Удалить все черновики? Это действие нельзя отменить.',
    en: 'Delete all drafts? This action cannot be undone.',
  },
  privacyLink: { ru: 'Удаление всех локальных данных', en: 'Delete all local data' },
  resetDefaults: { ru: 'Восстановить настройки по умолчанию', en: 'Restore defaults' },
  saved: { ru: 'Настройки хранения сохранены', en: 'Storage settings saved' },
  resetDone: { ru: 'Настройки хранения восстановлены', en: 'Storage settings restored' },
  cleanupDone: { ru: 'Удалено черновиков: {count}', en: 'Drafts deleted: {count}' },
  error: { ru: 'Не удалось выполнить операцию', en: 'The operation could not be completed' },
  loading: { ru: 'Загрузка данных хранилища…', en: 'Loading storage data…' },
});
