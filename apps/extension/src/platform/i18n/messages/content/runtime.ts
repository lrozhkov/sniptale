import { defineMessageSource } from '../source';

export const contentRuntimeMessages = defineMessageSource({
  selectionSaved: {
    ru: 'Скриншот выделенной области сохранён',
    en: 'Selection screenshot saved',
  },
  fullSaved: {
    ru: 'Скриншот полной страницы сохранён',
    en: 'Full page screenshot saved',
  },
  visibleSaved: {
    ru: 'Скриншот видимой области сохранён',
    en: 'Visible area screenshot saved',
  },
  sentToEditor: {
    ru: 'Скриншот отправлен в редактор',
    en: 'Screenshot sent to editor',
  },
  copiedToClipboard: {
    ru: 'Скриншот скопирован в буфер обмена',
    en: 'Screenshot copied to clipboard',
  },
  scenarioStepSaved: {
    ru: 'Шаг добавлен в сценарий',
    en: 'Step added to scenario',
  },
  quickActionCopiedToClipboard: {
    ru: 'Изображение скопировано в буфер обмена',
    en: 'Image copied to clipboard',
  },
  quickActionSaved: {
    ru: 'Изображение сохранено',
    en: 'Image saved',
  },
  saveArchiveFailed: {
    ru: 'Не удалось сохранить архив',
    en: 'Failed to save archive',
  },
  exportFailed: {
    ru: 'Не удалось выполнить экспорт',
    en: 'Failed to export',
  },
  exportPrepareFailed: {
    ru: 'Не удалось подготовить экспорт',
    en: 'Failed to prepare export',
  },
  exportAlreadyRunning: {
    ru: 'Экспорт уже выполняется',
    en: 'Export is already running',
  },
  invalidExportRequest: {
    ru: 'Некорректный запрос экспорта',
    en: 'Invalid export request',
  },
  scanPageStructure: {
    ru: 'Парсинг структуры страницы...',
    en: 'Scanning page structure...',
  },
  scanDirectLinks: {
    ru: 'Поиск прямых ссылок на файлы...',
    en: 'Searching for direct file links...',
  },
  scanDynamicContent: {
    ru: 'Обработка динамического контента...',
    en: 'Processing dynamic content...',
  },
  scanFroalaImages: {
    ru: 'Извлечение изображений из Froala редакторов...',
    en: 'Extracting images from Froala editors...',
  },
  exportParagraphLabel: {
    ru: 'Абзац',
    en: 'Paragraph',
  },
  exportListItemLabel: {
    ru: 'Элемент списка',
    en: 'List item',
  },
  exportCodeLabel: {
    ru: 'Код',
    en: 'Code',
  },
  exportTextLabel: {
    ru: 'Текст',
    en: 'Text',
  },
  captureFullPageScreenshot: {
    ru: 'Снимаем скриншот всей страницы...',
    en: 'Capturing the full-page screenshot...',
  },
  captureFullPageScreenshotFailed: {
    ru: 'Не удалось снять скриншот всей страницы',
    en: 'Failed to capture the full-page screenshot',
  },
  captureFullPageScreenshotRetryHint: {
    ru: 'Не удалось снять скриншот. Попробуйте закрыть режим разработчика или обновить страницу',
    en: 'Failed to capture the screenshot. Try closing DevTools or refreshing the page',
  },
  screenshotCaptureTimedOut: {
    ru: 'Скриншот не был завершён. Попробуйте снова.',
    en: 'Screenshot did not finish. Try again.',
  },
  exportCancelled: {
    ru: 'Экспорт отменён пользователем',
    en: 'Export was cancelled by the user',
  },
  downloadFilesPrefix: {
    ru: 'Скачивание файлов',
    en: 'Downloading files',
  },
  creatingArchive: {
    ru: 'Создание архива...',
    en: 'Creating archive...',
  },
  exportCompleted: {
    ru: 'Экспорт завершён!',
    en: 'Export completed',
  },
  copyImageFailed: {
    ru: 'Не удалось скопировать изображение в буфер обмена',
    en: 'Failed to copy image to clipboard',
  },
  copyTextFailed: {
    ru: 'Не удалось скопировать текст в буфер обмена',
    en: 'Failed to copy text to clipboard',
  },
  invalidImageData: {
    ru: 'Некорректные данные изображения',
    en: 'Invalid image data',
  },
  clipboardTextTooLarge: {
    ru: 'Текст слишком большой для копирования в буфер обмена',
    en: 'The text is too large to copy to the clipboard',
  },
  areaSelectPrompt: {
    ru: 'Выделите область для записи (кликните и потяните)',
    en: 'Select an area to record (click and drag)',
  },
  areaSelectTooSmall: {
    ru: 'Область выделения слишком мала. Выделите область минимум 10x10 пикселей.',
    en: 'The selected area is too small. Select at least 10x10 pixels.',
  },
  areaSelectTimeout: {
    ru: 'Время выделения истекло. Попробуйте снова.',
    en: 'Area selection timed out. Try again.',
  },
  commentTextUpdated: {
    ru: 'Текст комментария обновлён',
    en: 'Comment text updated',
  },
  froalaUnsupported: {
    ru: 'Редактирование Froala редактора не поддерживается (cross-origin)',
    en: 'Editing Froala content is not supported (cross-origin)',
  },
  showToolbarTitle: {
    ru: 'Показать панель',
    en: 'Show toolbar',
  },
  exportRequestHandlingFailed: {
    ru: 'Не удалось обработать экспортный запрос',
    en: 'Failed to handle export request',
  },
  exportModuleLoadFailed: {
    ru: 'Не удалось загрузить модуль экспорта',
    en: 'Failed to load export module',
  },
  harUnavailable: {
    ru: 'Сбор HAR недоступен',
    en: 'HAR collection is unavailable',
  },
  harFinalizeFailed: {
    ru: 'Не удалось завершить сбор HAR',
    en: 'Failed to finalize HAR collection',
  },
  templateNotFound: {
    ru: 'Шаблон не найден',
    en: 'Template not found',
  },
  unknownError: {
    ru: 'Неизвестная ошибка',
    en: 'Unknown error',
  },
});
