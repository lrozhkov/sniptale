import { defineMessageSource } from '../source';

export const editorPageMessages = defineMessageSource({
  documentTitle: {
    ru: 'Sniptale — Редактор изображений',
    en: 'Sniptale — Image editor',
  },
  loadingInspector: {
    ru: 'Загрузка инспектора',
    en: 'Loading inspector',
  },
  title: {
    ru: 'Добавьте изображение',
    en: 'Add an image',
  },
  subtitle: {
    ru: 'Выберите файл, перетащите его на холст или вставьте из буфера',
    en: 'Choose a file, drop it on the canvas, or paste it from the clipboard',
  },
});
