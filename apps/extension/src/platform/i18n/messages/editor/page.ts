import { defineMessageSource } from '../source';

export const editorPageMessages = defineMessageSource({
  renameImage: { ru: 'Имя файла', en: 'File name' },
  documentTitle: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  loadingInspector: {
    ru: 'Загрузка инспектора',
    en: 'Loading inspector',
  },
  loadingImage: {
    ru: 'Открываем изображение…',
    en: 'Opening image…',
  },
  openFailedTitle: {
    ru: 'Не удалось открыть изображение',
    en: 'Could not open the image',
  },
  openFailedHint: {
    ru: 'Попробуйте открыть другой файл или повторите попытку. Исходный файл не изменён.',
    en: 'Try another file or try again. The original file has not been changed.',
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
