import { defineMessageSource } from '../source';

export const galleryRecordingRecoveryMessages = defineMessageSource({
  title: { ru: 'Восстановление записи', en: 'Recording recovery' },
  description: {
    ru: 'Запись не удалось сохранить полностью. Восстановите доступное видео или скачайте исходные данные.',
    en: 'The recording could not be saved completely. Recover the available video or download the original data.',
  },
  recover: { ru: 'Восстановить в библиотеку', en: 'Recover to library' },
  download: { ru: 'Скачать исходные данные', en: 'Download original data' },
  rawHint: {
    ru: 'Исходный файл может быть неполным и не воспроизводиться.',
    en: 'The original file may be incomplete and may not play.',
  },
  delete: { ru: 'Удалить запись', en: 'Delete recording' },
  deleteTitle: { ru: 'Удалить сохранённые данные записи?', en: 'Delete saved recording data?' },
  deleteBody: {
    ru: 'Исходные данные этой записи будут удалены без возможности восстановления. Видео в библиотеке останутся.',
    en: 'The original data for this recording will be permanently deleted. Saved videos in the library will be kept.',
  },
  loadFailed: {
    ru: 'Не удалось проверить сохранённые записи. Повторите проверку.',
    en: 'Saved recordings could not be checked. Retry the check.',
  },
  actionFailed: {
    ru: 'Действие не завершено. Исходные данные сохранены. Повторите попытку или скачайте их.',
    en: 'The action did not finish. Original data is retained. Retry or download it.',
  },
  downloadFailed: {
    ru: 'Скачивание прервано или не подтверждено. Исходные данные сохранены. Повторите скачивание.',
    en: 'The download was interrupted or could not be confirmed. Original data is retained. Retry the download.',
  },
  busy: { ru: 'Обрабатываем сохранённые данные…', en: 'Processing saved data…' },
  loading: { ru: 'Проверяем сохранённые записи…', en: 'Checking saved recordings…' },
  retry: { ru: 'Проверить снова', en: 'Check again' },
});
