import { defineMessageSource } from '../source';

export const videoEditorProgressMessages = defineMessageSource({
  title: {
    ru: 'Ход экспорта',
    en: 'Export progress',
  },
  cancel: {
    ru: 'Отменить',
    en: 'Cancel',
  },
  cancelFailed: {
    ru: 'Не удалось отменить экспорт. Он продолжается — попробуйте отменить ещё раз.',
    en: 'Could not cancel the export. It is still running — try cancelling again.',
  },
  preparing: { ru: 'Подготовка видео', en: 'Preparing video' },
  rendering: { ru: 'Создание видео', en: 'Rendering video' },
  transcoding: { ru: 'Сборка файла', en: 'Finalizing file' },
  saving: { ru: 'Сохранение файла', en: 'Saving file' },
  done: { ru: 'Видео готово', en: 'Video ready' },
  failed: { ru: 'Экспорт не удался', en: 'Export failed' },
  cancelled: { ru: 'Экспорт отменён', en: 'Export cancelled' },
});
