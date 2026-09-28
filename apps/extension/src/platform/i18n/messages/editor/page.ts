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
  documentFileMissingTitle: {
    ru: 'Файл документа не найден',
    en: 'Document file not found',
  },
  documentFileMissingHint: {
    ru: 'Часть данных отсутствует в локальном хранилище. Откройте файл снова с устройства или выберите другое изображение. Запись документа не удалена.',
    en: 'Part of the document is missing from local storage. Open the file again from your device or choose another image. The document record was not deleted.',
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
