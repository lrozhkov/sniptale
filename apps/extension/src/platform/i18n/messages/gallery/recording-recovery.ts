import { defineMessageSource } from '../source';

export const galleryRecordingRecoveryMessages = defineMessageSource({
  title: { ru: 'Сохранённые части записи', en: 'Saved recording data' },
  description: {
    ru: 'После сбоя можно восстановить доступное видео. Исходные данные сохранятся.',
    en: 'After an interruption, recover the available video. Original data will be kept.',
  },
  interrupted: { ru: 'Прерванные записи', en: 'Interrupted recordings' },
  copies: { ru: 'Страховочные копии', en: 'Safety copies' },
  copiesDescription: {
    ru: 'Копии сохранённых записей занимают дополнительное место до удаления.',
    en: 'Copies of saved recordings use additional storage until deleted.',
  },
  recover: { ru: 'Восстановить в библиотеку', en: 'Recover to library' },
  download: { ru: 'Скачать исходные данные', en: 'Download original data' },
  rawHint: {
    ru: 'Исходный файл может быть неполным и не воспроизводиться.',
    en: 'The original file may be incomplete and may not play.',
  },
  delete: { ru: 'Удалить копию', en: 'Delete copy' },
  deleteTitle: { ru: 'Удалить сохранённые данные записи?', en: 'Delete saved recording data?' },
  deleteBody: {
    ru: 'Эта копия будет удалена без возможности восстановления. Видео в библиотеке останется.',
    en: 'This copy will be permanently deleted. Video in the library will be kept.',
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
  recovered: {
    ru: 'Восстановленное видео доступно в библиотеке. Исходные данные сохранены.',
    en: 'Recovered video is available in the library. Original data is retained.',
  },
  busy: { ru: 'Обрабатываем сохранённые данные…', en: 'Processing saved data…' },
  loading: { ru: 'Проверяем сохранённые записи…', en: 'Checking saved recordings…' },
  retry: { ru: 'Проверить снова', en: 'Check again' },
});
