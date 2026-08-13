import { defineMessageSource } from '../source';

export const editorDocumentActionsMessages = defineMessageSource({
  draft: {
    ru: 'Черновик',
    en: 'Draft',
  },
  inLibrary: {
    ru: 'В библиотеке',
    en: 'In library',
  },
  saveToLibrary: {
    ru: 'Сохранить в библиотеку',
    en: 'Save to library',
  },
  saveToLibraryError: {
    ru: 'Не удалось сохранить в библиотеку. Черновик сохранён.',
    en: 'Could not save to the library. Your draft is safe.',
  },
  reloadLatest: {
    ru: 'Загрузить актуальную версию',
    en: 'Reload latest',
  },
  saveCopy: {
    ru: 'Сохранить копию',
    en: 'Save copy',
  },
  fileSection: {
    ru: 'Файл',
    en: 'File',
  },
  moreActions: {
    ru: 'Другие действия',
    en: 'More actions',
  },
  moreActionsDescription: {
    ru: 'Шаблоны, JSON-сессия и сброс документа',
    en: 'Presets, JSON session, and document reset',
  },
  showMoreActions: {
    ru: 'Показать другие действия',
    en: 'Show more actions',
  },
  hideMoreActions: {
    ru: 'Скрыть другие действия',
    en: 'Hide more actions',
  },
  download: {
    ru: 'Сохранить в загрузки',
    en: 'Save to Downloads',
  },
  downloadAs: {
    ru: 'Сохранить как...',
    en: 'Save as...',
  },
  applyToScenario: {
    ru: 'Сохранить для слайда',
    en: 'Save for slide',
  },
  copyPng: {
    ru: 'Копировать в буфер',
    en: 'Copy to clipboard',
  },
  copyFormatUnsupported: {
    ru: 'Выбранный формат не поддерживается буфером обмена браузера.',
    en: 'The selected format is not supported by the browser clipboard.',
  },
  openImage: {
    ru: 'Открыть новый файл',
    en: 'Open new file',
  },
  closeFile: {
    ru: 'Закрыть файл',
    en: 'Close file',
  },
  returnToScenario: {
    ru: 'Вернуться к сценарию',
    en: 'Return to scenario',
  },
  confirmCloseDocument: {
    ru: 'Закрыть текущий файл? Несохраненные изменения будут потеряны.',
    en: 'Close the current file? Unsaved changes will be lost.',
  },
  resetTag: {
    ru: 'Сбросить',
    en: 'Reset',
  },
  saveToFolder: {
    ru: 'Сохранить в папку',
    en: 'Save to folder',
  },
  saveDialogTitle: {
    ru: 'Сохранить изображение',
    en: 'Save image',
  },
  saveDialogSubtitle: {
    ru: 'Выберите готовую папку или укажите другую через системный диалог.',
    en: 'Choose a preset folder or select another one in the system dialog.',
  },
  saveDialogFilename: {
    ru: 'Имя файла',
    en: 'Filename',
  },
  saveDialogFilenamePlaceholder: {
    ru: 'изображение.png',
    en: 'image.png',
  },
  saveDialogPresets: {
    ru: 'Готовые папки',
    en: 'Preset folders',
  },
  saveDialogSystemFolder: {
    ru: 'Выбрать другую папку',
    en: 'Choose another folder',
  },
  saveDialogSystemFolderHint: {
    ru: 'Открыть системный диалог сохранения',
    en: 'Open the system save dialog',
  },
  saveDialogError: {
    ru: 'Не удалось сохранить файл. Проверьте доступ к папке и повторите попытку.',
    en: 'Could not save the file. Check folder access and try again.',
  },
  saveToFolderDescription: {
    ru: 'Быстрые шаблоны сохранения в Downloads без системного диалога.',
    en: 'Quick Downloads presets without opening the system dialog.',
  },
  expandSection: {
    ru: 'Развернуть',
    en: 'Expand',
  },
  collapseSection: {
    ru: 'Свернуть',
    en: 'Collapse',
  },
  sessionSection: {
    ru: 'Сессия',
    en: 'Session',
  },
  presetTag: {
    ru: 'Шаблон',
    en: 'Preset',
  },
  exportSession: {
    ru: 'Экспорт сессии',
    en: 'Export session',
  },
  importSession: {
    ru: 'Импорт сессии',
    en: 'Import session',
  },
  jsonTag: {
    ru: 'JSON',
    en: 'JSON',
  },
  noDefaultPreset: {
    ru: 'Без шаблона',
    en: 'No preset',
  },
  noSavePresets: {
    ru: 'Нет активных шаблонов. Добавьте путь в настройках, чтобы быстро сохранять в папку без системного диалога.',
    en: 'No active presets. Add a path in settings to save quickly without the system dialog.',
  },
  downloadsPrefix: {
    ru: 'Downloads /',
    en: 'Downloads /',
  },
  pathFallback: {
    ru: '...',
    en: '...',
  },
  noPresetsDescription: {
    ru: 'Нет активных шаблонов. Добавьте путь в настройках, чтобы быстро сохранять в папку без системного диалога.',
    en: 'No active presets. Add a path in settings to save quickly without the system dialog.',
  },
});
