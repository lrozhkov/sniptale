import { defineMessageSource } from '../source';
import { editorToolLabelMessages } from './tool-labels';

export const editorRuntimeMessages = defineMessageSource({
  transparentLayer: {
    ru: 'Прозрачный слой',
    en: 'Transparent layer',
  },
  sourceImage: {
    ru: 'Основное изображение',
    en: 'Source image',
  },
  background: {
    ru: 'Фоновое изображение',
    en: 'Background image',
  },
  ...editorToolLabelMessages,
  browserFrame: {
    ru: 'Рамка браузера',
    en: 'Browser frame',
  },
  browserFrameRenderFailed: {
    ru: 'Не удалось обновить mockup окна браузера.',
    en: 'Failed to update the browser window mockup.',
  },
  metaStamp: {
    ru: 'Тех. метка',
    en: 'Meta stamp',
  },
  richShape: {
    ru: 'Фигура',
    en: 'Shape',
  },
  metaStampUrlLabel: {
    ru: 'URL страницы',
    en: 'Page URL',
  },
  metaStampDateLabel: {
    ru: 'Дата и время',
    en: 'Date and time',
  },
  metaStampBrowserLabel: {
    ru: 'Браузер',
    en: 'Browser',
  },
  metaStampPageLabel: {
    ru: 'Страница',
    en: 'Page',
  },
  layer: {
    ru: 'Слой',
    en: 'Layer',
  },
  defaultTextboxText: {
    ru: 'Текст',
    en: 'Text',
  },
  saveToGalleryFailed: {
    ru: 'Не удалось сохранить изображение обратно в Галерею.',
    en: 'Failed to save the image back to Gallery.',
  },
  saveImageFailed: {
    ru: 'Не удалось сохранить изображение.',
    en: 'Failed to save the image.',
  },
  copyImageFailed: {
    ru: 'Не удалось скопировать изображение в выбранном формате.',
    en: 'Failed to copy the image in the selected format.',
  },
  editorNotInitialized: {
    ru: 'Редактор ещё не инициализирован',
    en: 'Editor is not initialized yet',
  },
  canvasUnavailable: {
    ru: 'Canvas недоступен',
    en: 'Canvas is unavailable',
  },
  cropLoadFailed: {
    ru: 'Не удалось загрузить документ для crop',
    en: 'Failed to load the document for crop',
  },
  cropCanvasUnavailable: {
    ru: 'Canvas context недоступен для crop',
    en: 'Canvas context is unavailable for crop',
  },
  sessionImportParseFailed: {
    ru: 'Не удалось прочитать файл сессии редактора.',
    en: 'Failed to read the editor session file.',
  },
  sessionImportInvalid: {
    ru: 'Файл сессии редактора имеет некорректный формат.',
    en: 'The editor session file has an invalid format.',
  },
  newTab: {
    ru: 'Новая вкладка',
    en: 'New tab',
  },
  transparent: {
    ru: 'Прозрачный',
    en: 'Transparent',
  },
  closePopoverAria: {
    ru: 'Закрыть popover',
    en: 'Close popover',
  },
  noCommands: {
    ru: 'Нет команд',
    en: 'No commands',
  },
});
