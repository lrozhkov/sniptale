import { defineMessageSource } from '../source';

export const galleryStorageManagerMessages = defineMessageSource({
  badge: {
    ru: 'Хранилище',
    en: 'Storage Manager',
  },
  writeQuotaErrorPrefix: {
    ru: 'Не удалось выполнить',
    en: 'Failed to complete',
  },
  writeQuotaErrorBody: {
    ru: 'локальное хранилище переполнено.',
    en: 'because local storage is full.',
  },
  writeDatabaseErrorBody: {
    ru: 'база медиа сейчас недоступна.',
    en: 'because the media database is currently unavailable.',
  },
  writeDiskErrorBody: {
    ru: 'Chrome не смог записать данные на диск.',
    en: 'because Chrome could not write the data to disk.',
  },
  freeSpaceHint: {
    ru: 'Откройте Storage Manager и освободите место.',
    en: 'Open Storage Manager and free up some space.',
  },
  retryLaterHint: {
    ru: 'Откройте Storage Manager или повторите попытку позже.',
    en: 'Open Storage Manager or try again later.',
  },
  title: {
    ru: 'Освободить место',
    en: 'Free up space',
  },
  description: {
    ru: 'Показываем только понятные находки: что занимает место, почему это можно удалить и сколько освободится.',
    en: 'Only clear findings are shown: what takes space, why it can be deleted, and how much space you get back.',
  },
  readyTitle: {
    ru: 'Готово к очистке',
    en: 'Ready to clean',
  },
  readyDescription: {
    ru: 'Пустые разделы скрыты. Перед удалением можно посмотреть файлы в каждой группе.',
    en: 'Empty sections are hidden. You can review the files in each group before deleting.',
  },
  groupsCounter: {
    ru: 'разделов',
    en: 'sections',
  },
  spaceCounter: {
    ru: 'можно освободить',
    en: 'can be freed',
  },
  irreversibleTitle: {
    ru: 'Удаление без восстановления.',
    en: 'Deletion cannot be undone.',
  },
  groupSpaceLabel: {
    ru: 'освободится',
    en: 'to free',
  },
  empty: {
    ru: 'Сейчас нечего очищать. Когда появятся старые, тяжёлые или потерянные файлы, они появятся здесь.',
    en: 'There is nothing to clean right now. Old, heavy, or orphaned files will appear here when found.',
  },
  deleteGroup: {
    ru: 'Удалить',
    en: 'Delete',
  },
});
