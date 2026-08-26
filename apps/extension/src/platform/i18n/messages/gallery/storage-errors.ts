import { defineMessageSource } from '../source';

export const galleryStorageErrorMessages = defineMessageSource({
  writeFailurePrefix: {
    ru: 'Не удалось выполнить',
    en: 'Failed to complete',
  },
  quotaErrorBody: {
    ru: 'локальное хранилище переполнено.',
    en: 'because local storage is full.',
  },
  databaseErrorBody: {
    ru: 'база медиа сейчас недоступна.',
    en: 'because the media database is currently unavailable.',
  },
  diskErrorBody: {
    ru: 'Chrome не смог записать данные на диск.',
    en: 'because Chrome could not write the data to disk.',
  },
  reviewLibraryHint: {
    ru: 'Удалите ненужные материалы в Библиотеке и повторите попытку.',
    en: 'Delete unneeded items in Library and try again.',
  },
  retryLaterHint: {
    ru: 'Повторите попытку позже.',
    en: 'Try again later.',
  },
});
