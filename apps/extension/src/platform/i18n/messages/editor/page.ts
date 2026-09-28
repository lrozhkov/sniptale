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
    ru: 'Часть данных отсутствует в локальном хранилище. Запись документа сохранена. Если исходный снимок доступен, его можно восстановить.',
    en: 'Part of the document is missing from local storage. The document record remains. If the original capture is available, you can restore it.',
  },
  recoverOriginalAction: { ru: 'Восстановить оригинал', en: 'Restore original' },
  recoverOriginalTitle: {
    ru: 'Восстановить исходный снимок?',
    en: 'Restore the original capture?',
  },
  recoverOriginalMessage: {
    ru: 'Сохранённые правки и история этого документа будут заменены исходным снимком. Отменить это действие после подтверждения нельзя.',
    en: 'Saved edits and history for this document will be replaced with the original capture. This cannot be undone after confirmation.',
  },
  recoverOriginalConfirm: { ru: 'Восстановить', en: 'Restore' },
  recoverOriginalCancel: { ru: 'Отмена', en: 'Cancel' },
  recoverOriginalFailed: {
    ru: 'Не удалось открыть исходный снимок. Проверьте библиотеку и попробуйте ещё раз.',
    en: 'Could not open the original capture. Check the library and try again.',
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
