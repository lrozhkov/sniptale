import { defineMessageSource } from '../source';
import { editorToolbarLayerMessages } from './toolbar-layer-messages';
import { editorToolbarDisabledMessages } from './toolbar-disabled';
import { editorToolbarInspectorMessages } from './toolbar-inspector';

export const editorToolbarMessages = defineMessageSource({
  ...editorToolbarDisabledMessages,
  ...editorToolbarLayerMessages,
  expandInspectorPrefix: {
    ru: 'Развернуть инспектор:',
    en: 'Expand inspector:',
  },
  collapseInspector: {
    ru: 'Сжать инспектор',
    en: 'Collapse inspector',
  },
  file: {
    ru: 'Файл',
    en: 'File',
  },
  frame: {
    ru: 'Фон',
    en: 'Background',
  },
  browserFrame: {
    ru: 'Окно браузера',
    en: 'Browser window',
  },
  meta: {
    ru: 'Данные страницы',
    en: 'Page details',
  },
  textInsertMenu: {
    ru: 'Выбрать режим текста',
    en: 'Choose text mode',
  },
  insertImage: {
    ru: 'Вставить изображение',
    en: 'Insert image',
  },
  imageSize: {
    ru: 'Размер изображения',
    en: 'Image size',
  },
  crop: {
    ru: 'Обрезать холст',
    en: 'Crop canvas',
  },
  resize: {
    ru: 'Размер холста и изображения',
    en: 'Canvas and image size',
  },
  canvasSize: {
    ru: 'Обрезать холст',
    en: 'Crop canvas',
  },
  collapseLayers: {
    ru: 'Свернуть',
    en: 'Collapse',
  },
  undo: {
    ru: 'Отменить',
    en: 'Undo',
  },
  redo: {
    ru: 'Повторить',
    en: 'Redo',
  },
  resetOriginal: {
    ru: 'Сбросить к исходному',
    en: 'Reset to original',
  },
  resetOriginalTitle: {
    ru: 'Вернуться к началу истории?',
    en: 'Return to the start of history?',
  },
  resetOriginalMessage: {
    ru: 'Документ перейдёт к самому раннему состоянию истории. Изменения можно вернуть кнопкой «Повторить».',
    en: 'The document will return to the earliest state in history. You can restore edits with Redo.',
  },
  resetOriginalTooltip: {
    ru: 'История и оригинал изображения',
    en: 'History and original image',
  },
  historyChoicesTitle: {
    ru: 'Вернуть изображение',
    en: 'Revert image',
  },
  historyStart: {
    ru: 'К началу истории',
    en: 'To the start of history',
  },
  historyStartDescription: {
    ru: 'К самому раннему доступному шагу. Правки можно повторить.',
    en: 'Go to the earliest available step. Edits can be redone.',
  },
  restoreOriginal: {
    ru: 'Восстановить оригинал',
    en: 'Restore original',
  },
  restoreOriginalDescription: {
    ru: 'Вернуть исходный файл и удалить всю историю правок.',
    en: 'Restore the source file and delete all edit history.',
  },
  restoreOriginalTitle: {
    ru: 'Восстановить оригинал?',
    en: 'Restore the original?',
  },
  restoreOriginalMessage: {
    ru: 'Документ вернётся к исходному снимку или файлу. Вся история правок будет удалена без возможности отмены.',
    en: 'The document will return to the source capture or file. All edit history will be permanently deleted.',
  },
  annotationFrame: {
    ru: 'Рамка',
    en: 'Frame',
  },
  annotationComments: {
    ru: 'Комментарии',
    en: 'Comments',
  },
  annotationNumbering: {
    ru: 'Нумерация',
    en: 'Numbering',
  },
  workspace: {
    ru: 'Рабочая зона',
    en: 'Workspace',
  },
  viewSettings: {
    ru: 'Настройки рабочей зоны',
    en: 'Workspace settings',
  },
  gridMode: {
    ru: 'Режим сетки',
    en: 'Grid mode',
  },
  magnetMode: {
    ru: 'Магнит',
    en: 'Magnet',
  },
  viewportNavigation: {
    ru: 'Навигация по холсту',
    en: 'Canvas navigation',
  },
  preset: {
    ru: 'Шаблоны',
    en: 'Templates',
  },
  text: {
    ru: 'Текст',
    en: 'Text',
  },
  fillColor: {
    ru: 'Заливка',
    en: 'Fill',
  },
  strokeColor: {
    ru: 'Линия',
    en: 'Stroke',
  },
  size: {
    ru: 'Геометрия',
    en: 'Geometry',
  },
  textAlignment: {
    ru: 'Выравнивание',
    en: 'Alignment',
  },
  effects: {
    ru: 'Эффекты',
    en: 'Effects',
  },
  moreActions: {
    ru: 'Еще',
    en: 'More',
  },
  zoomOut: {
    ru: 'Отдалить',
    en: 'Zoom out',
  },
  zoomCurrentPrefix: {
    ru: 'Текущий масштаб:',
    en: 'Current zoom:',
  },
  zoomIn: {
    ru: 'Приблизить',
    en: 'Zoom in',
  },
  fitToWindow: {
    ru: 'Уместить в окно',
    en: 'Fit to window',
  },
  contextMenuView: {
    ru: 'Вид',
    en: 'View',
  },
  contextMenuArrange: {
    ru: 'Порядок',
    en: 'Arrange',
  },
  contextMenuTransform: {
    ru: 'Трансформировать',
    en: 'Transform',
  },
  resetZoomPrefix: {
    ru: '100%',
    en: '100%',
  },
  hideLayer: {
    ru: 'Скрыть слой',
    en: 'Hide layer',
  },
  showLayer: {
    ru: 'Показать слой',
    en: 'Show layer',
  },
  unlockLayer: {
    ru: 'Разблокировать слой',
    en: 'Unlock layer',
  },
  lockLayer: {
    ru: 'Заблокировать слой',
    en: 'Lock layer',
  },
  layersTitle: {
    ru: 'Слои',
    en: 'Layers',
  },
  showOutsideCanvas: {
    ru: 'Показывать фигуры за границей изображения',
    en: 'Show shapes outside the image',
  },
  layersPreferenceSaveFailed: {
    ru: 'Не удалось сохранить состояние панели слоев.',
    en: 'Could not save the layers panel state.',
  },
  layerCountSuffix: {
    ru: 'элементов',
    en: 'items',
  },
  raiseSelection: {
    ru: 'Поднять выделение',
    en: 'Raise selection',
  },
  lowerSelection: {
    ru: 'Опустить выделение',
    en: 'Lower selection',
  },
  hideLayers: {
    ru: 'Скрыть слои',
    en: 'Hide layers',
  },
  noLayers: {
    ru: 'Слои появятся после загрузки изображения.',
    en: 'Layers will appear after the image is loaded.',
  },
  previewNavigation: {
    ru: 'Навигация по превью холста',
    en: 'Preview canvas navigation',
  },
  openImage: {
    ru: 'Открыть изображение',
    en: 'Open image',
  },
  importSession: {
    ru: 'Импортировать сессию',
    en: 'Import session',
  },
  exportSession: {
    ru: 'Экспортировать сессию',
    en: 'Export session',
  },
  savePng: {
    ru: 'Сохранить PNG',
    en: 'Save PNG',
  },
  copyPng: {
    ru: 'Копировать в буфер',
    en: 'Copy to clipboard',
  },
  duplicateSelection: {
    ru: 'Дублировать выделение',
    en: 'Duplicate selection',
  },
  deleteSelection: {
    ru: 'Удалить выделение',
    en: 'Delete selection',
  },
  frontLayer: {
    ru: 'На передний план',
    en: 'Bring to front',
  },
  forwardLayer: {
    ru: 'На слой выше',
    en: 'Bring forward',
  },
  backLayer: {
    ru: 'На задний план',
    en: 'Send to back',
  },
  backwardLayer: {
    ru: 'На слой ниже',
    en: 'Send backward',
  },
  ...editorToolbarInspectorMessages,
});
