import { defineMessageSource } from '../source';

export const editorCanvasMessages = defineMessageSource({
  emptyEyebrow: {
    ru: 'Image Editor',
    en: 'Image Editor',
  },
  emptyTitle: {
    ru: 'Добавьте первое изображение',
    en: 'Add your first image',
  },
  emptyDescription: {
    ru: 'Выберите файл, перетащите изображение в окно или вставьте его из буфера.',
    en: 'Choose a file, drop an image into the window, or paste it from the clipboard.',
  },
  emptyDropzoneActive: {
    ru: 'Отпустите файл, чтобы открыть его',
    en: 'Release the file to open it',
  },
  emptyDropzoneHint: {
    ru: 'Ctrl+V тоже работает',
    en: 'Ctrl+V works too',
  },
  emptyDropzoneLabel: {
    ru: 'Зона импорта изображения',
    en: 'Image import drop zone',
  },
  emptyDropzoneTitle: {
    ru: 'Перетащите файл сюда',
    en: 'Drop a file here',
  },
  openImage: {
    ru: 'Выбрать файл',
    en: 'Choose file',
  },
});
