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
  preparing: { ru: 'Подготовка видео', en: 'Preparing video' },
  rendering: { ru: 'Создание видео', en: 'Rendering video' },
  transcoding: { ru: 'Обработка видео', en: 'Processing video' },
  saving: { ru: 'Сохранение файла', en: 'Saving file' },
  done: { ru: 'Видео готово', en: 'Video ready' },
  failed: { ru: 'Экспорт не удался', en: 'Export failed' },
  cancelled: { ru: 'Экспорт отменён', en: 'Export cancelled' },
});
